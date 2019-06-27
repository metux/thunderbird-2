// ***** BEGIN LICENSE BLOCK *****
// Version: MPL 1.1/GPL 2.0/LGPL 2.1
//
// The contents of this file are subject to the Mozilla Public License Version
// 1.1 (the "License"); you may not use this file except in compliance with
// the License. You may obtain a copy of the License at
// http://www.mozilla.org/MPL/
//
// Software distributed under the License is distributed on an "AS IS" basis,
// WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
// for the specific language governing rights and limitations under the
// License.
//
// The Original Code is Mozilla Corporation Code.
//
// The Initial Developer of the Original Code is
// based on the MozRepl project.
// Portions created by the Initial Developer are Copyright (C) 2008
// the Initial Developer. All Rights Reserved.
//
// Contributor(s):
//  Mikeal Rogers <mikeal.rogers@gmail.com>
//  Massimiliano Mirra <bard@hyperstruct.net>
//
// Alternatively, the contents of this file may be used under the terms of
// either the GNU General Public License Version 2 or later (the "GPL"), or
// the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
// in which case the provisions of the GPL or the LGPL are applicable instead
// of those above. If you wish to allow use of your version of this file only
// under the terms of either the GPL or the LGPL, and not to allow others to
// use your version of this file under the terms of the MPL, indicate your
// decision by deleting the provisions above and replace them with the notice
// and other provisions required by the GPL or the LGPL. If you do not delete
// the provisions above, a recipient may use your version of this file under
// the terms of any one of the MPL, the GPL or the LGPL.
//
// ***** END LICENSE BLOCK *****

var EXPORTED_SYMBOLS = ["Server", "server", "AsyncRead", "Session", "sessions", "globalRegistry", "startServer"];

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");

var events = ChromeUtils.import("chrome://jsbridge/content/modules/events.js");
var DEBUG_ON = false;
var BUFFER_SIZE = 1024;

var uuidgen = Cc["@mozilla.org/uuid-generator;1"].getService(Ci.nsIUUIDGenerator);

function AsyncRead(session) {
  this.session = session;
}

AsyncRead.prototype.onStartRequest = function(request) {};
AsyncRead.prototype.onStopRequest = function(request, status) {
  log("async onstoprequest: onstoprequest");
  this.session.onQuit();
};
AsyncRead.prototype.onDataAvailable = function(request, inputStream, offset, count) {
  var str = {};
  str.value = "";

  var bytesAvail = 0;
  do {
    var parts = {};
    if (count > BUFFER_SIZE) {
      bytesAvail = BUFFER_SIZE;
    } else {
      bytesAvail = count;
    }

    log("jsbridge: onDataAvailable, reading bytesAvail = " + bytesAvail + "\n");
    var bytesRead = this.session.instream.readString(bytesAvail, parts);
    count = count - bytesRead;
    log("jsbridge: onDataAvailable, read bytes: " + bytesRead + " count is now: " + count + "\n");
    str.value += parts.value;
  } while (count > 0);
  log("jsbridge: onDataAvailable, going into receive with: \n\n" + str.value + "\n\n");
  this.session.receive(str.value);
};

var globalRegistry = {};

function Bridge(session) {
  this.session = session;
  this.registry = globalRegistry;
}
Bridge.prototype._register = function(_type) {
  this.bridgeType = _type;
  if (_type == "backchannel") {
    events.addBackChannel(this);
  }
};
Bridge.prototype.register = function(uuid, _type) {
  try {
    this._register(_type);
    var passed = true;
  } catch (e) {
    var exception;
    if (typeof(e) == "string") {
      exception = e;
    } else {
      exception = {
        name: e.name,
        message: e.message,
      };
    }
    this.session.encodeOut({
      result: false,
      exception,
      uuid,
    });
  }
  if (passed != undefined) {
    this.session.encodeOut({
      result: true,
      eventType: "register",
      uuid,
    });
  }
};
Bridge.prototype._describe = function(obj) {
  var response = {};
  var type;
  if (obj === null) {
    type = "null";
  } else {
    type = typeof(obj);
  }
  if (type == "object") {
    if (obj.length != undefined) {
      type = "array";
    }
    response.attributes = [];
    for (var i in obj) {
      response.attributes = response.attributes.concat(i);
    }
  } else if (type != "function") {
    response.data = obj;
  }
  response.type = type;
  return response;
};
Bridge.prototype.describe = function(uuid, obj) {
  var response = this._describe(obj);
  response.uuid = uuid;
  response.result = true;
  this.session.encodeOut(response);
};
Bridge.prototype._set = function(obj) {
  var uuid = uuidgen.generateUUID().toString();
  this.registry[uuid] = obj;
  return uuid;
};
Bridge.prototype.set = function(uuid, obj) {
  var ruuid = this._set(obj);
  this.session.encodeOut({
    result: true,
    data: `bridge.registry["${ruuid}"]`,
    uuid,
  });
};
Bridge.prototype._setAttribute = function(obj, name, value) {
  obj[name] = value;
  return value;
};
Bridge.prototype.setAttribute = function(uuid, obj, name, value) {
  try {
    var result = this._setAttribute(obj, name, value);
  } catch (e) {
    var exception;
    if (typeof(e) == "string") {
      exception = e;
    } else {
      exception = {
        name: e.name,
        message: e.message,
      };
    }
    this.session.encodeOut({
      result: false,
      exception,
      uuid,
    });
  }
  if (result != undefined) {
    this.set(uuid, obj[name]);
  }
};
Bridge.prototype._execFunction = function(func, args) {
  return func.apply(this.session.sandbox, args);
};
Bridge.prototype.execFunction = function(uuid, func, args) {
  var result;
  try {
    var data = this._execFunction(func, args);
    result = true;
  } catch (e) {
    var exception;
    if (typeof(e) == "string") {
      exception = e;
    } else {
      exception = {
        name: e.name,
        message: e.message,
      };
    }
    this.session.encodeOut({
      result: false,
      exception,
      uuid,
    });
    result = true;
  }
  if (data != undefined) {
    this.set(uuid, data);
  } else if (result) {
    this.session.encodeOut({
      result: true,
      data: null,
      uuid,
    });
  } else {
    log("jsbridge threw unknown data in execFunc");
    throw new Error("JSBridge unknown data in execFunc");
  }
};

var backstage = this;

function Session(transport) {
  this.transpart = transport;  // XXX Unused, needed to hold reference? Note the typo.
  let systemPrincipal = Cc["@mozilla.org/systemprincipal;1"]
                          .createInstance(Ci.nsIPrincipal);
  this.sandbox = Cu.Sandbox(systemPrincipal, { wantGlobalProperties: ["ChromeUtils"] });
  this.sandbox.bridge = new Bridge(this);
  try {
      this.outputstream = transport.openOutputStream(Ci.nsITransport.OPEN_BLOCKING, 0, 0);
      this.outstream = Cc["@mozilla.org/intl/converter-output-stream;1"]
                         .createInstance(Ci.nsIConverterOutputStream);
      this.outstream.init(this.outputstream, "UTF-8");
      this.stream = transport.openInputStream(0, 0, 0);
      this.instream = Cc["@mozilla.org/intl/converter-input-stream;1"]
                        .createInstance(Ci.nsIConverterInputStream);
      this.instream.init(this.stream, "UTF-8", BUFFER_SIZE,
                         Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
  } catch (e) {
      log("jsbridge: Error: " + e);
  }
  log("jsbridge: Accepted connection.");

  this.pump = Cc["@mozilla.org/network/input-stream-pump;1"]
                .createInstance(Ci.nsIInputStreamPump);
  this.pump.init(this.stream, 0, 0, false);
  this.pump.asyncRead(new AsyncRead(this), null);
}
Session.prototype.onOutput = function(string) {
  log("jsbridge: write: " + string);
  if (typeof(string) != "string") {
    throw new Error("This is not a string");
  }
  try {
    var stroffset = 0;
    do {
      var parts = "";
      // Handle the case where we are writing something larger than our buffer
      if (string.length > BUFFER_SIZE) {
        log("jsbridge: onOutput: writing data stroffset is: " + stroffset + " string.length is: " + string.length);
        parts = string.slice(stroffset, stroffset + BUFFER_SIZE);
        log("jsbridge: onOutput: here is our part: \n" + parts + "\n");
      } else {
        parts = string;
      }

      // Update our offset
      stroffset = stroffset += parts.length;

      // write it
      this.outstream.writeString(parts);
    } while (stroffset < string.length);

    // Ensure the entire stream is flushed
    this.outstream.flush();
  } catch (e) {
    log("jsbridge: threw on writing string: " + string + "   exception: " + e);
    throw new Error("JSBridge cannot write: " + string);
  }
};
Session.prototype.onQuit = function() {
  this.instream.close();
  this.outstream.close();
  sessions.remove(this);
};
Session.prototype.encodeOut = function(obj) {
  try {
    this.onOutput(JSON.stringify(obj));
  } catch (e) {
    var exception;
    if (typeof(e) == "string") {
      exception = e;
    } else {
      exception = {
        name: e.name,
        message: e.message,
      };
    }
    this.onOutput(JSON.stringify({
      result: false,
      exception,
    }));
  }
};
Session.prototype.receive = function(data) {
  Cu.evalInSandbox(data, this.sandbox);
};

var sessions = {
  _list: [],
  add(session) {
    this._list.push(session);
  },
  remove(session) {
    var index = this._list.indexOf(session);
    if (index != -1)
      this._list.splice(index, 1);
  },
  get(index) {
    return this._list[index];
  },
  quit() {
    this._list.forEach(function(session) { session.onQuit(); });
    this._list.splice(0, this._list.length);
  },
};

function Server(port) {
  this.port = port;
}
Server.prototype.start = function() {
  try {
    this.serv = Cc["@mozilla.org/network/server-socket;1"]
                  .createInstance(Ci.nsIServerSocket);
    this.serv.init(this.port, true, -1);
    this.serv.asyncListen(this);
  } catch (e) {
    log("jsbridge: Exception: " + e);
  }
};
Server.prototype.stop = function() {
  log("jsbridge: Closing...");
  this.serv.close();
  this.sessions.quit();
  this.serv = undefined;
};
Server.prototype.onStopListening = function(serv, status) {
// Stub function
};
Server.prototype.onSocketAccepted = function(serv, transport) {
  let session = new Session(transport);
  sessions.add(session);
};

function log(msg) {
  if (DEBUG_ON) {
    dump(msg + "\n");
  }
}

function startServer(port) {
  var server = new Server(port);
  server.start();
}


