/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.import("resource://calendar/modules/calUtils.jsm");

function calIcsSerializer() {
    this.wrappedJSObject = this;
    this.mItems = [];
    this.mProperties = [];
    this.mComponents = [];
}
calIcsSerializer.prototype = {
    QueryInterface: ChromeUtils.generateQI([Ci.calIIcsSerializer]),
    classID: Components.ID("{207a6682-8ff1-4203-9160-729ec28c8766}"),

    addItems: function(aItems, aCount) {
        if (aCount > 0) {
            this.mItems = this.mItems.concat(aItems);
        }
    },

    addProperty: function(aProperty) {
        this.mProperties.push(aProperty);
    },

    addComponent: function(aComponent) {
        this.mComponents.push(aComponent);
    },

    serializeToString: function() {
        let calComp = this.getIcalComponent();
        return calComp.serializeToICS();
    },

    serializeToInputStream: function(aStream) {
        let calComp = this.getIcalComponent();
        return calComp.serializeToICSStream();
    },

    serializeToStream: function(aStream) {
        let str = this.serializeToString();

        // Convert the javascript string to an array of bytes, using the
        // UTF8 encoder
        let convStream = Cc["@mozilla.org/intl/converter-output-stream;1"]
                           .createInstance(Ci.nsIConverterOutputStream);
        convStream.init(aStream, "UTF-8");

        convStream.writeString(str);
        convStream.close();
    },

    getIcalComponent: function() {
        let calComp = cal.getIcsService().createIcalComponent("VCALENDAR");
        cal.item.setStaticProps(calComp);

        // xxx todo: think about that the below code doesn't clone the properties/components,
        //           thus ownership is moved to returned VCALENDAR...

        for (let prop of this.mProperties) {
            calComp.addProperty(prop);
        }
        for (let comp of this.mComponents) {
            calComp.addSubcomponent(comp);
        }

        for (let item of cal.iterate.items(this.mItems)) {
            calComp.addSubcomponent(item.icalComponent);
        }

        return calComp;
    }
};
