/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Tests of override functionality using a demo "foo" type url.

var {
  JaBaseUrlProperties,
} = ChromeUtils.import("resource:///modules/jsaccount/JaBaseUrl.jsm");

var extraInterfaces = [Ci.msgIFooUrl];

function newURL() {
  return Cc["@mozilla.org/jsaccount/testjafoourl;1"]
           .createInstance(Ci.nsISupports);
}

var tests = [
  function testExists() {
    // test the existence of components and their interfaces.
    let url = newURL();
    for (let iface of JaBaseUrlProperties.baseInterfaces) {
      Assert.ok(url instanceof iface);
      let urlQI = url.QueryInterface(iface);
      Assert.ok(urlQI);
    }
    for (let iface of extraInterfaces) {
      let fooUrl = url.getInterface(iface);
      Assert.ok(fooUrl instanceof iface);
      Assert.ok(fooUrl.QueryInterface(iface));
    }
  },
  function test_msgIOverride() {
    let url = newURL().QueryInterface(Ci.msgIOverride);

    // test of access to wrapped JS object.

    // Access the ._hidden attribute using the XPCOM interface,
    // where it is not defined.
    Assert.equal(typeof url.jsDelegate._hidden, "undefined");

    // Get the JS object, where _hidden IS defined.
    Assert.equal(url.jsDelegate.wrappedJSObject._hidden, "IAmHidden");
  },

  // We used to test nsIURI, nsIURL, and nsIMsgMailNewsUrl overrides, but those
  // can no longer be overridden.
  function test_nsIMsgMessageUrl() {
    let url = newURL().QueryInterface(Ci.nsIMsgMessageUrl);
    Assert.ok("originalSpec" in url);
    let appDir = Services.dirsvc.get("GreD", Ci.nsIFile);
    Assert.ok(appDir.path);
    // test attributes
    url.messageFile = appDir;
    Assert.equal(url.messageFile.path, appDir.path);
  },
  function test_msgIJaUrl() {
    let url = newURL().QueryInterface(Ci.msgIJaUrl);
    url.setUrlType(Ci.nsIMsgMailNewsUrl.eMove);
    Assert.ok(url.QueryInterface(Ci.nsIMsgMailNewsUrl).IsUrlType(Ci.nsIMsgMailNewsUrl.eMove));
  },
  function test_msgIFooUrl() {
    let url = newURL().QueryInterface(Ci.nsIInterfaceRequestor);
    let fooUrl = url.getInterface(Ci.msgIFooUrl);
    Assert.ok(fooUrl instanceof Ci.msgIFooUrl);

    fooUrl.itemId = "theItemId";
    Assert.equal(fooUrl.itemId, "theItemId");

    url.QueryInterface(Ci.msgIJaUrl).setSpec("https://foo.invalid/bar/");
    Assert.ok(!fooUrl.isAttachment);
    url.QueryInterface(Ci.msgIJaUrl).setSpec("https://foo.invalid/bar?part=1.4&dummy=stuff");
    Assert.ok(fooUrl.isAttachment);
  },
];

function run_test() {
  for (var test of tests)
    test();
}
