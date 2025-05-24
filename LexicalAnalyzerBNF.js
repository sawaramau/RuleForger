"use strict"
/*
 * RuleForger - A parser generator for intuitive syntax and semantics
 * Copyright (c) 2025 k.izu
 * Licensed under the ISC License. See LICENSE file for details.
 */
const {
    StringObject,
    SelectLogic,
    Evaluator,
    AstNode,
    AstManager,
    BnfAstNode,
    CoreAstNode,
    LazyGenerator,
    AbstractGroup,
    CoreGroup,
    CoreNonTerminal,
    CoreTerminal,
    CoreTerminalDot,
    CoreTerminalSet,
    CoreNegTerminalSet,
    CoreWhite,
    AbstractRepeater,
    CoreRepeater,
    CoreAsterisk,
    CoreOption,
    CorePlus,
    UserCoreGroup,
    CoreOr,
} = require('./common.js');

const {NotImplementedError, CoreLayerError, BnfLayerError, RuntimeLayerError, UncategorizedLayerError} = require('./Error.js');

/*
TOKEN : /regexp/ ~flag1 ~flag2 !exclude1 !exclude2 -> valType
 */

class CoreEntryPoint extends CoreNonTerminal {
    get define() {
        return [CoreAsterisk.getOrCreate(this.parserGenerator, CoreExpr.getOrCreate(this.parserGenerator, ))];
    }
}

class CoreExpr extends CoreNonTerminal {
    get define() {
        return [
            CoreOr.getOrCreate(this.parserGenerator, 
                Assign.getOrCreate(this.parserGenerator, ), 
                CoreOr.getOrCreate(this.parserGenerator, 
                    CoreTerminal.getOrCreate(this.parserGenerator, ';'), 
                    CoreTerminal.getOrCreate(this.parserGenerator, '\n')
                ), 
                CoreWhite.getOrCreate(this.parserGenerator, )
            )
        ];
    }
}

class Assign extends UserCoreGroup {
    static get operator() {
        return ':';
    }
    get define() {
        return [
            AssignLeft.getOrCreate(this.parserGenerator, ), CoreWhite.getOrCreate(this.parserGenerator, ), CoreTerminal.getOrCreate(this.parserGenerator, Assign.operator), 
            CoreWhite.getOrCreate(this.parserGenerator, ), AssignRight.getOrCreate(this.parserGenerator, ), CoreWhite.getOrCreate(this.parserGenerator, ), 
        ];
    }
    static assign(bnfAstNode) {
        bnfAstNode.assertBaseInstanceOf(this);
        const left = bnfAstNode.children.find(t => t.baseType === AssignLeft);
        const right = bnfAstNode.children.find(t => t.baseType === AssignRight);
        return [left, right];
    }
}

class AssignLeft extends UserCoreGroup {
    get define() {
        return [
            CoreWhite.getOrCreate(this.parserGenerator, ),
            UserNonTerminal.getOrCreate(this.parserGenerator, ), 
            CoreWhite.getOrCreate(this.parserGenerator, ),
        ];
    }
    static argNames(bnfAstNode) {
        bnfAstNode.assertBaseInstanceOf(this);
        return [];
    }
    static nameHierarchy(bnfAstNode) {
        bnfAstNode.assertBaseInstanceOf(this);
        const hierarchies = bnfAstNode.dig(UserNonTerminal, true, 1, 1);
        return UserNonTerminal.nameHierarchy(hierarchies[0]);
    }
}

class AssignRight extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            RightValue.getOrCreate(this.parserGenerator, ),
        ];
    }
    static getMostLeftNotNullableTerms(bnfAstNode) {
        // 字句解析に左再帰は存在しないので，空の配列を返す．
        return [];
    }
    static getAllTerms(bnfAstNode) {
        // 字句解析に左再帰は存在しないので，空の配列を返す．
        return [];
    }
}

class RightValue extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            UserRegExp.getOrCreate(this.parserGenerator, ),
            UserAsterisk.getOrCreate(this.parserGenerator, 
                CoreWhite.getOrCreate(this.parserGenerator, ),
                UserOr.getOrCreate(this.parserGenerator, 
                    UserFlag.getOrCreate(this.parserGenerator, ),
                    UserExeclude.getOrCreate(this.parserGenerator, ),
                    UserType.getOrCreate(this.parserGenerator, ),
                ),
            ),
            CoreWhite.getOrCreate(this.parserGenerator, CoreWhite.whiteExcluder),
        ];
    }
    static valids() {
        throw new CoreLayerError("This method must be not called.", Error);
    }
    static generateSecondaryParser(bnfAstNode) {
        bnfAstNode.assertBaseInstanceOf(this);
        const reg = bnfAstNode.children.find(t => t.baseType === UserRegExp);
        const ast = bnfAstNode.children.find(t => t.baseType === UserAsterisk);
        ast.valids = [1];
        const parser = reg.generateSecondaryParser;
        const test = parser.test;
        const process = (astNode, strObj, result, seed) => {
            const child = parser.parse(strObj, seed);
            astNode.addChild(child.node);
        };
        return AstNode.parserWrapper(bnfAstNode, test, process);
    }
}

class Name extends UserCoreGroup {
    static reuseable = true;
    get define() {
        const az = "abcdefghijklmnopqrstuvwxyz";
        const AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const digit = "0123456789";
        const symbol = "_";
        return [
            CoreTerminalSet.getOrCreate(this.parserGenerator, symbol, az, AZ), CoreAsterisk.getOrCreate(this.parserGenerator, CoreTerminalSet.getOrCreate(this.parserGenerator, symbol, az, AZ, digit))
        ];
    }
}

class UserNonTerminal extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            Name.getOrCreate(this.parserGenerator, ), 
            // CoreAsterisk.getOrCreate(this.parserGenerator, CoreWhite.getOrCreate(this.parserGenerator, ), CoreTerminal.getOrCreate(this.parserGenerator, UserNonTerminal.selector), CoreWhite.getOrCreate(this.parserGenerator, ), Name.getOrCreate(this.parserGenerator, ))
        ];
    }
    static get selector() {
        return '.';
    }
    static nameHierarchy(bnfAstNode) {
        bnfAstNode.assertBaseInstanceOf(this);
        return bnfAstNode.dig(Name);
    }
    static generateSecondaryParser(bnfAstNode) {
        const parser = bnfAstNode.bnfAstManager.getSecondaryParser(bnfAstNode);
        const test = (strObj, index, seed = null) => {
            if(!bnfAstNode.isRecursive || !seed) {
                const result = parser.test(strObj, index, seed);
                return result;
            }
            if(bnfAstNode.isRecursive && seed) {
                // 左再帰処理用のテスト結果横流し
                const length = (() => {
                    if(seed.inProgress) {
                        return seed.length;
                    }
                    return 0;
                })();
                return {
                    success: true,
                    length: length,
                };
            }
        };
        const process = (astNode, strObj, result, seed) => {
            if(!seed || !bnfAstNode.isRecursive) {
                astNode.nameHierarchy = bnfAstNode.bnfAstManager.getFullNameStr(result.space);
                return parser.process(astNode, strObj, result, seed);
            }
            // 自身が左再帰であるならば，そもそもparse時点で呼ばれるべきではない．
            throw new CoreLayerError("Must not reach here.", Error);
        };
        return AstNode.parserWrapper(bnfAstNode, test, process);
    }
    static generateEvaluator(astNode) {
        return new Evaluator(astNode);
    }
}

class UserRepeater extends CoreRepeater {
    static generateSecondaryParser(bnfAstNode) {
        if(bnfAstNode.instance.args[0]?.constructor === UserCoreGroup) {
            for(const t of bnfAstNode.children) {
                t.valids = bnfAstNode.valids;
            }
        }
        const test = (strObj, index, seed) => {
            let length = 0;
            for(const bnfAstChild of bnfAstNode.children) {
                const result = bnfAstChild.generateSecondaryParser.test(strObj, index + length, seed);
                if(!result.success) {
                    return {
                        success: false,
                        length: undefined,
                    };
                }
                length += result.length;
            }
            return {
                success: true,
                length: length,
            };
        };
        const process = (astNode, strObj, result, seed) => {
            for(const bnfAstChild of bnfAstNode.children) {
                const child = bnfAstChild.generateSecondaryParser.parse(strObj, seed);
                astNode.addChild(child.node);
            }
        };
        return AstNode.parserWrapper(bnfAstNode, test, process);
    }
}

class UserAsterisk extends UserRepeater {
    constructor(parserGenerator, ...args) {
        super(parserGenerator, ...args);
        this.min = 0;
        this.max = Infinity;
    }
}

class UserOption extends UserRepeater {
    constructor(parserGenerator, ...args) {
        if(args.length > 1) {
            args = [CoreGroup.getOrCreate(parserGenerator, ...args)];
        }
        super(parserGenerator, ...args);
        this.min = 0;
        this.max = 1;
    }
}

class UserPlus extends UserRepeater {
    constructor(parserGenerator, ...args) {
        super(parserGenerator, ...args);
        this.min = 1;
        this.max = Infinity;
    }
}

class UserOr extends CoreOr {
    static valids(bnfAstNode) {
        // Or要素がbnfTokensとして返す要素は1つだけなので，有効な要素のインデックスは必ず0
        return [0];
    }
    static generateSecondaryParser(bnfAstNode) {
        return UserCoreGroup.generateSecondaryParser.call(this, bnfAstNode);
    }
}

class UserTerminal extends UserCoreGroup {
    static reuseable = true;
    get bracket() {
        return ['"', '"'];
    }
    get escape() {
        return UserEscape;
    }
    get define() {
        const escape = this.escape.getOrCreate(this.parserGenerator, );
        return [
            CoreTerminal.getOrCreate(this.parserGenerator, this.bracket[0]), 
            CoreAsterisk.getOrCreate(this.parserGenerator, CoreOr.getOrCreate(this.parserGenerator, CoreNegTerminalSet.getOrCreate(this.parserGenerator, this.bracket[1], escape.escapeChar), escape)), 
            CoreTerminal.getOrCreate(this.parserGenerator, this.bracket[1]),
        ];
    }
    static targetString(bnfAstNode) {
        let str = "";
        for(const or of bnfAstNode.children[1].children) {
            const charNode = or.children[0];
            str += charNode.baseType.char(charNode);
        }
        return str;
    }
    static terminalTest(strObj, index, bnfAstNode, seed) {
        const str = this.targetString(bnfAstNode);
        const start = index;
        const target = strObj.read(start, str.length);
        if(str === target) {
            return {
                success: true,
                length: str.length
            };
        }
        return {
            success: false,
            length: undefined
        }
    }
    static generateSecondaryParser(bnfAstNode) {
        const test = (strObj, index, seed) => this.terminalTest(strObj, index, bnfAstNode, seed);
        const process = (astNode, strObj, result, seed) => {
            strObj.shift(result.length);
            astNode.length = result.length;
        };
        return AstNode.parserWrapper(bnfAstNode, test, process);
    }
    static generateEvaluator(astNode) {
        return new Evaluator(astNode);
    }
}

class UserRegExp extends UserTerminal {
    static reuseable = true;
    get bracket() {
        return ['/', '/'];
    }
    get allowedOption() {
        return 'si';
    }
    get define() {
        const def = super.define;
        const opt = CoreAsterisk.getOrCreate(this.parserGenerator, 
            CoreTerminalSet.getOrCreate(this.parserGenerator, this.allowedOption),
        );
        def.push(opt);
        return def;
    }
    static terminalTest(strObj, index, bnfAstNode, seed) {
        const regStr = this.targetString(bnfAstNode);
        const opt = bnfAstNode.children[3].str;
        // 先頭から読むのでyオプションを追加
        const regExp = new RegExp(regStr, opt + "y");
        const testStr = strObj.str;
        const match = testStr.match(regExp);
        if(!match) {
            return {
                success: false
            };
        }
        return {
            success: true,
            length: match[0].length,
        };
    }
}

class UserEscape extends UserCoreGroup {
    static reuseable = true;
    get escapeChar() {
        return '\\';
    }
    get define() {
        return [CoreTerminal.getOrCreate(this.parserGenerator, this.escapeChar), CoreTerminalDot.getOrCreate(this.parserGenerator, )];
    }
    static char(bnfAstNode) {
        const char = bnfAstNode.children[1].bnfStr;
        const escapes = new Map;
        escapes.set('n', '\n');
        escapes.set('t', '\t');
        escapes.set('v', '\v');
        escapes.set('r', '\r');
        escapes.set('0', '\0');
        escapes.set('b', '\b');
        if(escapes.has(char)) {
            return escapes.get(char);
        }
        return char;
    }
}

class UserFlag extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            CoreTerminal.getOrCreate(this.parserGenerator, '~'),
            CoreWhite.getOrCreate(this.parserGenerator, ),
            CoreOr.getOrCreate(this.parserGenerator, 
                CoreTerminal.getOrCreate(this.parserGenerator, "reserve"),
            )
        ];
    }
}

class UserExeclude extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            CoreTerminal.getOrCreate(this.parserGenerator, '!'),
            CoreWhite.getOrCreate(this.parserGenerator, ),
            CoreOr.getOrCreate(this.parserGenerator, 
                CoreTerminal.getOrCreate(this.parserGenerator, "reserve"),
            )
        ];
    }
}

class UserType extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            CoreTerminal.getOrCreate(this.parserGenerator, '->'),
            CoreWhite.getOrCreate(this.parserGenerator, ),
            CoreOr.getOrCreate(this.parserGenerator, 
                CoreTerminal.getOrCreate(this.parserGenerator, "int"),
                CoreTerminal.getOrCreate(this.parserGenerator, "float"),
            )
        ];
    }
}

module.exports = {
    CoreEntryPoint,
    UserNonTerminal,
    Name,
    Assign,
    AssignRight,
    AssignLeft,
    RightValue
};
