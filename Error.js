"use strict"

class BaseLayerError extends Error {
    constructor(message, rule, name = new.target.name) {
        super(name + "." + rule.name + ":" + message);
        this.name = name;
        this.rule = rule;
    }
}

module.exports = {
    NotImplementedError: class extends Error {
        constructor(message = "This method is not implemented.") {
            super(message);
            this.name = "NotImplementedError";
        }
    },
    BaseLayerError,
    CoreLayerError: class extends BaseLayerError {
        constructor(message, rule) {
            super(message, rule);
        }
    },
    BnfLayerError: class extends BaseLayerError {
        constructor(message, rule) {
            super(message, rule);
        }
    },
    AstLayerError: class extends BaseLayerError {
        constructor(message, rule) {
            super(message, rule);
        }
    },
    RuntimeLayerError: class extends BaseLayerError {
        constructor(message, rule) {
            super(message, rule);
        }
    },
    UncategorizedLayerError: class extends BaseLayerError {
        constructor(message, rule) {
            super(message, rule);
        }
    },
};
