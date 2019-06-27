/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["Stanza", "XMPPParser", "SupportedFeatures"];

/* eslint-disable key-spacing */
var NS = {
  xml                       : "http://www.w3.org/XML/1998/namespace",
  xhtml                     : "http://www.w3.org/1999/xhtml",
  xhtml_im                  : "http://jabber.org/protocol/xhtml-im",

  // auth
  client                    : "jabber:client",
  streams                   : "http://etherx.jabber.org/streams",
  stream                    : "urn:ietf:params:xml:ns:xmpp-streams",
  sasl                      : "urn:ietf:params:xml:ns:xmpp-sasl",
  tls                       : "urn:ietf:params:xml:ns:xmpp-tls",
  bind                      : "urn:ietf:params:xml:ns:xmpp-bind",
  session                   : "urn:ietf:params:xml:ns:xmpp-session",
  auth                      : "jabber:iq:auth",
  auth_feature              : "http://jabber.org/features/iq-auth",
  http_bind                 : "http://jabber.org/protocol/httpbind",
  http_auth                 : "http://jabber.org/protocol/http-auth",
  xbosh                     : "urn:xmpp:xbosh",

  "private"                 : "jabber:iq:private",
  xdata                     : "jabber:x:data",

  // roster
  roster                    : "jabber:iq:roster",
  roster_versioning         : "urn:xmpp:features:rosterver",
  roster_delimiter          : "roster:delimiter",

  // privacy lists
  privacy                   : "jabber:iq:privacy",

  // discovering
  disco_info                : "http://jabber.org/protocol/disco#info",
  disco_items               : "http://jabber.org/protocol/disco#items",
  caps                      : "http://jabber.org/protocol/caps",

  // addressing
  address                   : "http://jabber.org/protocol/address",

  muc_user                  : "http://jabber.org/protocol/muc#user",
  muc_owner                 : "http://jabber.org/protocol/muc#owner",
  muc_admin                 : "http://jabber.org/protocol/muc#admin",
  muc_rooms                 : "http://jabber.org/protocol/muc#rooms",
  conference                : "jabber:x:conference",
  muc                       : "http://jabber.org/protocol/muc",
  register                  : "jabber:iq:register",
  delay                     : "urn:xmpp:delay",
  delay_legacy              : "jabber:x:delay",
  bookmarks                 : "storage:bookmarks",
  chatstates                : "http://jabber.org/protocol/chatstates",
  event                     : "jabber:x:event",
  stanzas                   : "urn:ietf:params:xml:ns:xmpp-stanzas",
  vcard                     : "vcard-temp",
  vcard_update              : "vcard-temp:x:update",
  ping                      : "urn:xmpp:ping",
  carbons                   : "urn:xmpp:carbons:2",

  geoloc                    : "http://jabber.org/protocol/geoloc",
  geoloc_notify             : "http://jabber.org/protocol/geoloc+notify",
  mood                      : "http://jabber.org/protocol/mood",
  tune                      : "http://jabber.org/protocol/tune",
  nick                      : "http://jabber.org/protocol/nick",
  nick_notify               : "http://jabber.org/protocol/nick+notify",
  activity                  : "http://jabber.org/protocol/activity",
  rsm                       : "http://jabber.org/protocol/rsm",
  last                      : "jabber:iq:last",
  version                   : "jabber:iq:version",
  avatar_data               : "urn:xmpp:avatar:data",
  avatar_data_notify        : "urn:xmpp:avatar:data+notify",
  avatar_metadata           : "urn:xmpp:avatar:metadata",
  avatar_metadata_notify    : "urn:xmpp:avatar:metadata+notify",
  pubsub                    : "http://jabber.org/protocol/pubsub",
  pubsub_event              : "http://jabber.org/protocol/pubsub#event",
};

var TOP_LEVEL_ELEMENTS = {
  "message"             : "jabber:client",
  "presence"            : "jabber:client",
  "iq"                  : "jabber:client",
  "stream:features"     : "http://etherx.jabber.org/streams",
  "proceed"             : "urn:ietf:params:xml:ns:xmpp-tls",
  "failure"             : ["urn:ietf:params:xml:ns:xmpp-tls",
                           "urn:ietf:params:xml:ns:xmpp-sasl"],
  "success"             : "urn:ietf:params:xml:ns:xmpp-sasl",
  "challenge"           : "urn:ietf:params:xml:ns:xmpp-sasl",
  "error"               : "urn:ietf:params:xml:ns:xmpp-streams",
};
/* eslint-enable key-spacing */

// Features that we support in XMPP.
// Don't forget to add your new features here.
var SupportedFeatures = [
  NS.chatstates,
  NS.conference,
  NS.disco_info,
  NS.last,
  NS.muc,
  NS.ping,
  NS.vcard,
  NS.version,
];

/* Stanza Builder */
var Stanza = {
  NS,

  /* Create a presence stanza */
  presence: (aAttr, aData) => Stanza.node("presence", null, aAttr, aData),

  /* Create a message stanza */
  message(aTo, aMsg, aState, aAttr = {}, aData = []) {
    aAttr.to = aTo;
    if (!("type" in aAttr))
      aAttr.type = "chat";

    if (aMsg)
      aData.push(Stanza.node("body", null, null, aMsg));

    if (aState)
      aData.push(Stanza.node(aState, Stanza.NS.chatstates));

    return Stanza.node("message", null, aAttr, aData);
  },

  /* Create a iq stanza */
  iq(aType, aId, aTo, aData) {
    let attrs = {type: aType};
    if (aId)
      attrs.id = aId;
    if (aTo)
      attrs.to = aTo;
    return this.node("iq", null, attrs, aData);
  },

  /* Create a XML node */
  node(aName, aNs, aAttr, aData) {
    let node = new XMLNode(null, aNs, aName, aName, aAttr);
    if (aData) {
      if (!Array.isArray(aData))
        aData = [aData];
      for (let child of aData)
        node[typeof(child) == "string" ? "addText" : "addChild"](child);
    }

    return node;
  },
};

/* Text node
 * Contains a text */
function TextNode(aText) {
  this.text = aText;
}
TextNode.prototype = {
  get type() { return "text"; },

  append(aText) {
    this.text += aText;
  },

  /* For debug purposes, returns an indented (unencoded) string */
  convertToString(aIndent) { return aIndent + this.text + "\n"; },

  /* Returns the encoded XML */
  getXML() {
    return Cc["@mozilla.org/txttohtmlconv;1"]
           .getService(Ci.mozITXTToHTMLConv)
           .scanTXT(this.text, Ci.mozITXTToHTMLConv.kEntities);
  },

  /* To read the unencoded data. */
  get innerText() { return this.text; },
};

/* XML node */
/* https://www.w3.org/TR/2008/REC-xml-20081126 */
/* aUri is the namespace. */
/* aLocalName must have value, otherwise throws. */
/* aAttr can be instance of nsISAXAttributes or object */
/* Example: <f:a xmlns:f='g' d='1'> is parsed to
   uri/namespace='g', localName='a', qName='f:a', attributes={d='1'} */
function XMLNode(aParentNode, aUri, aLocalName, aQName = aLocalName,
                 aAttr = {}) {
  if (!aLocalName)
    throw new Error("aLocalName must have value");

  this._parentNode = aParentNode; // Used only for parsing
  this.uri = aUri;
  this.localName = aLocalName;
  this.qName = aQName;
  this.attributes = {};
  this.children = [];

  if (aAttr instanceof Ci.nsISAXAttributes) {
    for (let i = 0; i < aAttr.length; ++i)
      this.attributes[aAttr.getQName(i)] = aAttr.getValue(i);
  }
  else {
    for (let attributeName in aAttr) {
      // Each attribute specification has a name and a value.
      if (aAttr[attributeName])
        this.attributes[attributeName] = aAttr[attributeName];
    }
  }
}
XMLNode.prototype = {
  get type() { return "node"; },

  /* Add a new child node */
  addChild(aNode) {
    this.children.push(aNode);
  },

  /* Add text node */
  addText(aText) {
    let lastIndex = this.children.length - 1;
    if (lastIndex >= 0 && this.children[lastIndex] instanceof TextNode)
      this.children[lastIndex].append(aText);
    else
      this.children.push(new TextNode(aText));
  },

  /* Get child elements by namespace */
  getChildrenByNS(aNS) {
    return this.children.filter(c => c.uri == aNS);
  },

  /* Get the first element anywhere inside the node (including child nodes)
     that matches the query.
     A query consists of an array of localNames. */
  getElement(aQuery) {
    if (aQuery.length == 0)
      return this;

    let nq = aQuery.slice(1);
    for (let child of this.children) {
      if (child.type == "text" || child.localName != aQuery[0])
        continue;
      let n = child.getElement(nq);
      if (n)
        return n;
    }

    return null;
  },

  /* Get all elements of the node (including child nodes) that match the query.
     A query consists of an array of localNames. */
  getElements(aQuery) {
    if (aQuery.length == 0)
      return [this];

    let c = this.getChildren(aQuery[0]);
    let nq = aQuery.slice(1);
    let res = [];
    for (let child of c) {
      let n = child.getElements(nq);
      res = res.concat(n);
    }

    return res;
  },

  /* Get immediate children by the node name */
  getChildren(aName) {
    return this.children.filter((c) => (c.type != "text" && c.localName == aName));
  },

  // Test if the node is a stanza and its namespace is valid.
  isXmppStanza() {
    if (!TOP_LEVEL_ELEMENTS.hasOwnProperty(this.qName))
      return false;
    let ns = TOP_LEVEL_ELEMENTS[this.qName];
    return ns == this.uri || (Array.isArray(ns) && ns.includes(this.uri));
  },

  /* Returns indented XML */
  convertToString(aIndent = "") {
    let s =
      aIndent + "<" + this.qName + this._getXmlns() + this._getAttributeText();
    let content = "";
    for (let child of this.children)
      content += child.convertToString(aIndent + " ");
    return s + (content ? ">\n" + content + aIndent + "</" + this.qName : "/") + ">\n";
  },

  /* Returns the XML */
  getXML() {
    let s = "<" + this.qName + this._getXmlns() + this._getAttributeText();
    let innerXML = this.innerXML;
    return s + (innerXML ? ">" + innerXML + "</" + this.qName : "/") + ">";
  },

  get innerXML() { return this.children.map(c => c.getXML()).join(""); },
  get innerText() { return this.children.map(c => c.innerText).join(""); },

  /* Private methods */
  _getXmlns() { return this.uri ? " xmlns=\"" + this.uri + "\"" : ""; },
  _getAttributeText() {
    let s = "";
    for (let name in this.attributes)
      s += " " + name + "=\"" + this.attributes[name] + "\"";
    return s;
  },
};

function XMPPParser(aListener) {
  this._parser = Cc["@mozilla.org/saxparser/xmlreader;1"]
                   .createInstance(Ci.nsISAXXMLReader);
  this._parser.contentHandler = this;
  this._parser.errorHandler = this;
  this._parser.parseAsync(null);
  this._listener = aListener;
  this._parser.onStartRequest(this._dummyRequest);
}
XMPPParser.prototype = {
  _destroyPending: false,
  destroy() {
    // Avoid reference cycles
    this._parser.contentHandler = null;
    delete this._listener;
    // Calling onStopRequest while we are in an onDataAvailable
    // callback crashes, don't do it.
    if (this._inOnDataAvailable) {
      this._destroyPending = true;
      return;
    }
    this._parser.onStopRequest(this._dummyRequest, Cr.NS_OK);
    // Stopping the request causes parse errors (because we parsed
    // only partial XML documents?), so the error handler is still
    // needed to avoid the errors being reported to the error console.
    this._parser.errorHandler = null;
    delete this._parser;
  },
  _dummyRequest: {
    cancel() { },
    isPending() { },
    resume() { },
    suspend() { },
  },

  _logReceivedData(aData) {
    this._listener.LOG("received:\n" + aData);
  },
  _inOnDataAvailable: false,
  onDataAvailable(aInputStream, aOffset, aCount) {
    this._inOnDataAvailable = true;
    this._parser.onDataAvailable(this._dummyRequest,
                                 aInputStream, aOffset, aCount);
    delete this._inOnDataAvailable;
    if (this._destroyPending)
      this.destroy();
  },

  /* nsISAXContentHandler implementation */
  startDocument() { },
  endDocument() { },

  startElement(aUri, aLocalName, aQName, aAttributes) {
    if (aQName == "stream:stream") {
      let node = new XMLNode(null, aUri, aLocalName, aQName, aAttributes);
      // The node we created doesn't have children, but
      // <stream:stream> isn't closed, so avoid displaying /> at the end.
      this._logReceivedData(node.convertToString().slice(0, -3) + ">\n");

      if ("_node" in this) {
        this._listener.onXMLError("unexpected-stream-start",
                                  "stream:stream inside an already started stream");
        return;
      }

      this._listener._streamId = node.attributes.id;
      if (!("version" in node.attributes))
        this._listener.startLegacyAuth();

      this._node = null;
      return;
    }

    let node = new XMLNode(this._node, aUri, aLocalName, aQName, aAttributes);
    if (this._node)
      this._node.addChild(node);

    this._node = node;
  },

  characters(aCharacters) {
    if (!this._node) {
      // Ignore whitespace received on the stream to keep the connection alive.
      if (aCharacters.trim()) {
        this._listener.onXMLError("parsing-characters",
                                  "No parent for characters: " + aCharacters);
      }
      return;
    }

    this._node.addText(aCharacters);
  },

  endElement(aUri, aLocalName, aQName) {
    if (aQName == "stream:stream") {
      this._logReceivedData("</stream:stream>");
      delete this._node;
      return;
    }

    if (!this._node) {
      this._listener.onXMLError("parsing-node",
                                "No parent for node : " + aLocalName);
      return;
    }

    // RFC 6120 (8): XML Stanzas.
    // Checks if the node is the root and it's valid.
    if (!this._node._parentNode) {
      if (this._node.isXmppStanza()) {
        this._logReceivedData(this._node.convertToString());
        try {
          this._listener.onXmppStanza(this._node);
        } catch (e) {
          Cu.reportError(e);
          dump(e + "\n");
        }
      }
      else {
        this._listener.onXMLError("parsing-node",
                                  "Root node " + aLocalName + " is not valid.");
      }
    }

    this._node = this._node._parentNode;
  },

  processingInstruction(aTarget, aData) { },

  /* nsISAXErrorHandler implementation */
  error(aError) {
    if (this._listener)
      this._listener.onXMLError("parse-error", aError);
  },
  fatalError(aError) {
    if (this._listener)
      this._listener.onXMLError("parse-fatal-error", aError);
  },
  ignorableWarning(aError) {
    if (this._listener)
      this._listener.onXMLError("parse-warning", aError);
  },

  QueryInterface: ChromeUtils.generateQI(["nsISAXContentHandler",
                                          "nsISAXErrorHandler"]),
};
