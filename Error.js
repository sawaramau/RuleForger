"use strict"

module.exports = {
    NotImplementedError: class extends Error {
        constructor(message = "This method is not implemented.") {
            super(message);
            this.name = "NotImplementedError";
        }
    }
};
