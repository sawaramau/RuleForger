"use strict"

class LogLevel {
    static get Error() {
        return 0;
    };
    static get Warn() {
        return 1;
    };
    static get Info() {
        return 2;
    };
    static get Debug() {
        return 3;
    };
}
class ErrorStrictLevel {
    static get Low() {
        return 0;
    }
    static get High() {
        return 1;
    }
}

class GlobalErrorLevelManager {
    static #singleton = null;
    #strictLevel = ErrorStrictLevel.Low;
    #logLevel = LogLevel.Error;
    constructor() {
        if(GlobalErrorLevelManager.#singleton) {
            return GlobalErrorLevelManager.#singleton;
        }
        GlobalErrorLevelManager.#singleton = this;
    }
    set strictLevel(val) {
        return this.#strictLevel = val;
    }
    get strictLevel() {
        return this.#strictLevel;
    }
    set logLevel(val) {
        return this.#logLevel = val;
    }
    get logLevel() {
        return this.#logLevel;
    }
}
const errorLevelManager = new GlobalErrorLevelManager;

class BaseLayerError extends Error {
    constructor(message, rule, logLevel = 0, name = new.target.name.slice(0, -5)) {
        super(name + "." + rule.name + ": " + message);
        this.name = name;
        this.rule = rule;
        // ログレベルがエラー，または厳格モード時にログレベルがWarnであればthrow
        if(logLevel === LogLevel.Error || logLevel <= errorLevelManager.strictLevel) {
            throw this;
        }
        // ログレベルがログ表示ポリシー以下であれば表示
        if (logLevel <= errorLevelManager.logLevel) {
            if (logLevel === LogLevel.Warn) {
                console.warn(name + "." + rule.name.replace("Error", "") +".Warning: " + message);
            } else if (logLevel === LogLevel.Info) {
                console.info(name + "." + rule.name.replace("Error", "") + ".Info: " + message);
            } else if (logLevel === LogLevel.Debug) {
                console.log(name + "." + rule.name.replace("Error", "") + ".Debug: " + message);
            }
        }
    }
}

module.exports = {
    LogLevel,
    ErrorStrictLevel,
    GlobalErrorLevelManager,
    NotImplementedError: class extends Error {
        constructor(message = "This method is not implemented.") {
            super(message);
            this.name = "NotImplementedError";
        }
    },
    BaseLayerError,
    CoreLayerError: class extends BaseLayerError {
        constructor(message, rule, logLevel) {
            super(message, rule, logLevel);
        }
    },
    LexLayerError: class extends BaseLayerError {
        constructor(message, rule, logLevel) {
            super(message, rule, logLevel);
        }
    },
    BnfLayerError: class extends BaseLayerError {
        constructor(message, rule, logLevel) {
            super(message, rule, logLevel);
        }
    },
    AstLayerError: class extends BaseLayerError {
        constructor(message, rule, logLevel) {
            super(message, rule, logLevel);
        }
    },
    RuntimeLayerError: class extends BaseLayerError {
        constructor(message, rule, logLevel) {
            super(message, rule, logLevel);
        }
    },
    UncategorizedLayerError: class extends BaseLayerError {
        constructor(message, rule, logLevel) {
            super(message, rule, logLevel);
        }
    },
};
