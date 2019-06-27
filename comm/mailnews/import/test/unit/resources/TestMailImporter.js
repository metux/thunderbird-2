var {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

function TestMailImpoter() {
}

TestMailImpoter.prototype = {
  classID: Components.ID("{a81438ef-aca1-41a5-9b3a-3ccfbbe4f5e1}"),

  QueryInterface: ChromeUtils.generateQI([Ci.nsIImportModule,
                                          Ci.nsIImportMail]),

  contractID: "@mozilla.org/import/test;1",

  _xpcom_categories: [{
    category: "mailnewsimport",
    entry: "{a81438ef-aca1-41a5-9b3a-3ccfbbe4f5e1}",
    value: "mail",
  }],

  name: "Test mail import module",

  description: "Test module for mail import",

  supports: "mail",

  supportsUpgrade: true,

  GetImportInterface(type) {
    if (type != "mail")
      return null;
    let importService = Cc["@mozilla.org/import/import-service;1"]
                        .createInstance(Ci.nsIImportService);
    let genericInterface = importService.CreateNewGenericMail();
    genericInterface.SetData("mailInterface", this);
    let name = Cc["@mozilla.org/supports-string;1"]
               .createInstance(Ci.nsISupportsString);
    name.data = "TestMailImporter";
    genericInterface.SetData("name", name);
    return genericInterface;
  },

  GetDefaultLocation(location, found, userVerify) {
    found = false;
    userVerify = false;
  },

  _createMailboxDescriptor(path, name, depth) {
    let importService = Cc["@mozilla.org/import/import-service;1"]
                        .createInstance(Ci.nsIImportService);
    let descriptor = importService.CreateNewMailboxDescriptor();
    descriptor.size = 100;
    descriptor.depth = depth;
    descriptor.SetDisplayName(name);
    descriptor.file.initWithPath(path);

    return descriptor;
  },

  _collectMailboxesInDirectory(directory, depth, result) {
    let descriptor = this._createMailboxDescriptor(directory.path,
                                                   directory.leafName,
                                                   depth);
    result.appendElement(descriptor);
    let entries = directory.directoryEntries;
    while (entries.hasMoreElements()) {
      let entry = entries.nextFile;
      if (entry.isDirectory())
        this._collectMailboxesInDirectory(entry, depth + 1, result);
    }
  },

  FindMailboxes(location) {
    let result = Cc["@mozilla.org/array;1"]
                   .createInstance(Ci.nsIMutableArray);
    this._collectMailboxesInDirectory(location, 0, result);

    return result;
  },

  ImportMailbox(source, destination, errorLog, successLog, fatalError) {
    this.progress = 0;
    let msgStore = destination.msgStore;

    let entries = source.directoryEntries;
    while (entries.hasMoreElements()) {
      let entry = entries.nextFile;
      if (!entry.isFile())
        continue;

      let newMsgHdr = {};
      let reusable = {};
      let outputStream = msgStore.getNewMsgOutputStream(destination,
                                                        newMsgHdr,
                                                        reusable);

      let inputStream = Cc["@mozilla.org/network/file-input-stream;1"]
                         .createInstance(Ci.nsIFileInputStream);
      inputStream.init(entry, -1, -1, 0);
      let count = inputStream.available();
      while (count > 0) {
        let writtenBytes = outputStream.writeFrom(inputStream, count);
        count -= writtenBytes;
        if (count == 0)
          count = inputStream.available();
      }
      msgStore.finishNewMessage(outputStream, newMsgHdr);
      inputStream.close();
      outputStream.close();
    }
    this.progress = 100;
  },

  GetImportProgress() {
    return this.progress;
  },

  translateFolderName(folderName) {
    return folderName;
  },

};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([TestMailImpoter]);
