/*
 * Copyright (c) 2013 Adobe Systems Incorporated. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */

(function () {
    "use strict";

    var _generator = null,
        _activeDocumentId = null,
        _openDocumentIdMap = {};

    function findOtherOpenedDocuments() {
        var _documentsClosedDuringUpdate = {};
        function onDocumentClosed(documentId) {
            _documentsClosedDuringUpdate[documentId] = true;
        }

        _generator.on("documentClosed", onDocumentClosed);
        _generator.evaluateJSXFile("./jsx/init.jsx").done(function (result) {
            _generator.removeListener("documentClosed", onDocumentClosed);
            
            if (!result) {
                throw new Error("init.jsx did not return a result");
            }

            result.documentIds.forEach(function (documentId) {
                if (!_openDocumentIdMap[documentId] && !_documentsClosedDuringUpdate[documentId]) {
                    _openDocumentIdMap[documentId] = true;
                    _generator.emit("documentDiscovered", documentId);
                }
            });
        });
    }

    function handleCurrentDocumentChanged(documentId) {
        console.log(">> CDC", arguments);

        // Gather the current state
        var previousDocumentId = _activeDocumentId,
            documentWasKnown   = _openDocumentIdMap.hasOwnProperty(documentId),
            documentWasActive  = _activeDocumentId === documentId;

        // Update the state
        if (!documentWasKnown) {
            _openDocumentIdMap[documentId] = true;
        }
        if (!documentWasActive) {
            _activeDocumentId = documentId;
        }

        // Broadcast the state change
        if (!documentWasKnown) {
            console.log(">> emitting documentDiscovered (1)", documentId);
            _generator.emit("documentDiscovered", documentId);
        }
        if (!documentWasActive) {
            console.log(">> emitting documentActivated (1)", _activeDocumentId, previousDocumentId);
            _generator.emit("documentActivated", _activeDocumentId, previousDocumentId);
        }

        // Photoshop only mentions one of multiple files opened: discover the others
        if (!documentWasKnown) {
            console.log("<<< FINDING OTHERS >>>");
            findOtherOpenedDocuments();
        }
    }

    function handleDocumentClosed(documentId) {
        // Gather the current state
        var documentWasActive = _activeDocumentId === documentId;

        if (documentWasActive) {
            _activeDocumentId = null;
        }

        if (documentWasActive) {
            console.log(">> emitting documentActivated (2)", _activeDocumentId, documentId);
            _generator.emit("documentActivated", _activeDocumentId, documentId);
        }
        console.log(">> emitting documentClosed (1)", documentId);
        _generator.emit("documentClosed", documentId);
    }

    function handleImageChanged(documentChange) {
        console.log(">> IC", arguments);

        if (documentChange.closed) {
            handleDocumentClosed(documentChange.id);
        }
    }

    function handleGeneratorMenuChanged(event) {
        console.log(">> GMC", event, new Date());
        
        // Ignore changes to other menus
        var menu = event.generatorMenuChanged;
        if (!menu || !menu.name) { return; }
        
        menu.documentId    = _activeDocumentId;
        menu.previousState = _generator.getMenuState(menu.name);
        
        console.log(">> emitting menuClicked (1)", menu);
        _generator.emit("menuClicked", menu);
    }

    function setup(generator) {
        _generator = generator;
        
        var PHOTOSHOP_EVENT_PREFIX = _generator.PHOTOSHOP_EVENT_PREFIX,
            eventHandlers = {
                currentDocumentChanged: handleCurrentDocumentChanged,
                generatorMenuChanged:   handleGeneratorMenuChanged,
                imageChanged:           handleImageChanged
            },
            temporaryEventHandlers = {},
            cachedEvents = [];
        
        // Cache all events that occur from now on until we know the document state
        Object.keys(eventHandlers).forEach(function (eventName) {
            var temporaryEventHandler = function () {
                console.log(">> CACHING", arguments[0]);
                cachedEvents.push({ name: eventName, arguments: arguments });
            };
            temporaryEventHandlers[eventName] = temporaryEventHandler;
            _generator.on(PHOTOSHOP_EVENT_PREFIX + eventName, temporaryEventHandler);
        });

        // Gather the states and register the Photoshop > Generator part of the event handlers
        console.log(">> INIT.JSX", new Date());
        var params = { events: Object.keys(eventHandlers) };
        _generator.evaluateJSXFile("./jsx/init.jsx", params).then(
            function (result) {
                console.log(">> INIT.JSX DONE", new Date(), JSON.stringify(result));

                if (!result) {
                    throw new Error("init.jsx did not return a result");
                }

                // Initialize the state
                console.log(">> INITIALIZING STATE");
                _activeDocumentId = result.activeDocumentId || null;
                result.documentIds.forEach(function (documentId) {
                    _openDocumentIdMap[documentId] = true;
                });

                // Remove the temporary event handlers
                console.log(">> REMOVING TEMPORARY EVENT HANDLERS");
                Object.keys(temporaryEventHandlers).forEach(function (eventName) {
                    _generator.removeListener(PHOTOSHOP_EVENT_PREFIX + eventName, temporaryEventHandlers[eventName]);
                });
                temporaryEventHandlers = null;

                // Register the final event handlers
                console.log(">> REGISTERING FINAL EVENT HANDLERS");
                Object.keys(eventHandlers).forEach(function (eventName) {
                    _generator.on(PHOTOSHOP_EVENT_PREFIX + eventName, eventHandlers[eventName]);
                });

                // Make sure the listeners know the state, too
                console.log(">> BROADCASTING INITIAL STATE");
                Object.keys(_openDocumentIdMap).forEach(function (documentId) {
                    console.log(">> emitting documentDiscovered (2)", documentId);
                    _generator.emit("documentDiscovered", documentId);
                });
                if (_activeDocumentId) {
                    console.log(">> emitting documentActivated (3)", _activeDocumentId, null);
                    _generator.emit("documentActivated", _activeDocumentId, null);
                }

                // Process the cached events
                console.log(">> PROCESSING CACHED EVENTS");
                cachedEvents.forEach(function (cachedEvent) {
                    console.log(">>     " + cachedEvent.name);
                    var eventHandler = eventHandlers[cachedEvent.name];
                    eventHandler.apply(null, cachedEvent.arguments);
                });
                cachedEvents = null;

                console.log(">> TRACKER READY");
                _generator.emit("trackerReady");

                console.log(">> SETUP DONE");
            },
            function (err) {
                console.error("Error during tracker initialization:", err);
                _generator.shutdown();
            }
        );
    }

    exports.setup = setup;
}());