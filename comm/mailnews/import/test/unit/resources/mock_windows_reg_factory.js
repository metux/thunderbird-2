const {MockFactory} = ChromeUtils.import("resource://testing-common/mailnews/MockFactory.js");

var gUuid;

function MockWindowsRegKey(registryData) {
  this._registryData = registryData;
}

MockWindowsRegKey.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.nsIWindowsRegKey]),

  open(aRootKey, aRelPath, aMode) {
    if (!this._registryData[aRelPath])
      throw Cr.NS_ERROR_FAILURE;
    this._keyPath = aRelPath;
  },

  close() {
  },

  openChild(aRelPath, aMode) {
    if (!this._registryData[this._keyPath] ||
        !this._registryData[this._keyPath][aRelPath])
      throw Cr.NS_ERROR_FAILURE;

    let child = new MockWindowsRegKey({});
    let newKeyPath = this._keyPath + "\\" + aRelPath;
    child._keyPath = newKeyPath;
    child._registryData[newKeyPath] =
      this._registryData[this._keyPath][aRelPath];
    return child;
  },

  get childCount() {
    return Object.keys(this._registryData[this._keyPath]).length;
  },

  getChildName(aIndex) {
    let keys = Object.keys(this._registryData[this._keyPath]);
    let keyAtIndex = keys[aIndex];
    if (!keyAtIndex)
      throw Cr.NS_ERROR_FAILURE;

    return keyAtIndex;
  },

  _readValue(aName) {
    if (!this._registryData[this._keyPath] ||
        !this._registryData[this._keyPath][aName])
      throw Cr.NS_ERROR_FAILURE;

    return this._registryData[this._keyPath][aName];
  },

  readIntValue(aName) {
    return this._readValue(aName);
  },

  readStringValue(aName) {
    return this._readValue(aName);
  },
};

/* exported setup_mock_registry, teardown_mock_registry */
function setup_mock_registry(mockRegistry) {
  gUuid = MockFactory.register("@mozilla.org/windows-registry-key;1",
                              MockWindowsRegKey, mockRegistry);
}

function teardown_mock_registry() {
  MockFactory.unregister(gUuid);
}
