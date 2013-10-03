/* global params, app, ActionDescriptor, executeAction, DialogModes, stringIDToTypeID */

// Gather the state
var documents        = app.documents,
    documentIds      = [],
    activeDocumentId = documents.length > 0 ? app.activeDocument.id : null;

for (var i = 0; i < documents.length; i++) {
    documentIds.push(documents[i].id);
}

// Register for events
if (params && params.events) {
    var i, actionDescriptor;
    actionDescriptor = new ActionDescriptor();
    actionDescriptor.putString(stringIDToTypeID("version"), "1.0.0");
    for (i = 0; i < params.events.length; i++) {
        actionDescriptor.putClass(stringIDToTypeID("eventIDAttr"), stringIDToTypeID(params.events[i]));
        executeAction(stringIDToTypeID("networkEventSubscribe"), actionDescriptor, DialogModes.NO);
    }
}

// Returning the data this way both works with ExtendScript and doesn't upset JSHint
var json = "";
json += "\"documentIds\": [" + documentIds.join(", ") + "],";
// Don't use app.activeDocument ? ... : ... - it throw an exception when no document is open
// Yet, app.hasOwnProperty("activeDocument") says it's there.
json += "\"activeDocumentId\": " + activeDocumentId;
json = "{ " + json + " }";
