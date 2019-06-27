/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.import("resource://calendar/modules/calUtils.jsm");

function calFreeBusyListener(numOperations, finalListener) {
    this.mFinalListener = finalListener;
    this.mNumOperations = numOperations;

    this.opGroup = new cal.data.OperationGroup(() => {
        this.notifyResult(null);
    });
}
calFreeBusyListener.prototype = {
    QueryInterface: ChromeUtils.generateQI([Ci.calIGenericOperationListener]),

    mFinalListener: null,
    mNumOperations: 0,
    opGroup: null,

    notifyResult: function(result) {
        let listener = this.mFinalListener;
        if (listener) {
            if (!this.opGroup.isPending) {
                this.mFinalListener = null;
            }
            listener.onResult(this.opGroup, result);
        }
    },

    // calIGenericOperationListener:
    onResult: function(aOperation, aResult) {
        if (this.mFinalListener) {
            if (!aOperation || !aOperation.isPending) {
                --this.mNumOperations;
                if (this.mNumOperations == 0) {
                    this.opGroup.notifyCompleted();
                }
            }
            let opStatus = aOperation ? aOperation.status : Cr.NS_OK;
            if (Components.isSuccessCode(opStatus) &&
                aResult && Array.isArray(aResult)) {
                this.notifyResult(aResult);
            } else {
                this.notifyResult([]);
            }
        }
    }
};

function calFreeBusyService() {
    this.wrappedJSObject = this;
    this.mProviders = new Set();
}
calFreeBusyService.prototype = {
    QueryInterface: ChromeUtils.generateQI([Ci.calIFreeBusyProvider, Ci.calIFreeBusyService]),
    classID: Components.ID("{29c56cd5-d36e-453a-acde-0083bd4fe6d3}"),

    mProviders: null,

    // calIFreeBusyProvider:
    getFreeBusyIntervals: function(aCalId, aRangeStart, aRangeEnd, aBusyTypes, aListener) {
        let groupListener = new calFreeBusyListener(this.mProviders.size, aListener);
        for (let provider of this.mProviders.values()) {
            let operation = provider.getFreeBusyIntervals(aCalId, aRangeStart,
                                                          aRangeEnd,
                                                          aBusyTypes,
                                                          groupListener);
            groupListener.opGroup.add(operation);
        }
        return groupListener.opGroup;
    },

    // calIFreeBusyService:
    addProvider: function(aProvider) {
        this.mProviders.add(aProvider.QueryInterface(Ci.calIFreeBusyProvider));
    },
    removeProvider: function(aProvider) {
        this.mProviders.delete(aProvider.QueryInterface(Ci.calIFreeBusyProvider));
    }
};
