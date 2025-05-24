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
const {
    LexicalAnalyzer
} = require('./LexicalAnalyzer.js');
const {NotImplementedError, CoreLayerError, BnfLayerError, RuntimeLayerError, UncategorizedLayerError} = require('./Error.js');

class CoreEntryPoint extends CoreNonTerminal {
    // BNF読む時点ではBnfAstManager等はいないので，
    // エントリポイント自体でLexicalAnalyzerを持つ．（= RuleForger毎にLexicalAnalyzerを持っている）
    #lexicalAnalyzer = new LexicalAnalyzer();
    get define() {
        return [CoreAsterisk.getOrCreate(CoreExpr.getOrCreate())];
    }
    set tokens(val) {
        this.#lexicalAnalyzer.tokens = val;
    }
    get lexicalAnalyzer() {
        return this.#lexicalAnalyzer;
    }
}

class CoreExpr extends CoreNonTerminal {
    get define() {
        return [
            CoreOr.getOrCreate(
                Assign.getOrCreate(), 
                CoreOr.getOrCreate(
                    CoreTerminal.getOrCreate(';'), 
                    CoreTerminal.getOrCreate('\n')
                ), 
                CoreWhite.getOrCreate()
            )
        ];
    }
}

class Assign extends UserCoreGroup {
    static get operator() {
        return '=';
    }
    get define() {
        return [
            AssignLeft.getOrCreate(), CoreWhite.getOrCreate(), CoreTerminal.getOrCreate(Assign.operator), 
            CoreWhite.getOrCreate(), AssignRight.getOrCreate(), CoreWhite.getOrCreate(), 
        ];
    }
    static assign(bnfAstNode) {
        bnfAstNode.assertBaseInstanceOf(this);
        const left = bnfAstNode.children.find(t => t.baseType === AssignLeft);
        const right = bnfAstNode.children.find(t => t.baseType === AssignRight);
        return [left, right];
    }
    static systemAssign(leftStr, rightBnfs, manager, systemSpace) {
        let str = leftStr;
        for(const right of rightBnfs) {
            
        }
    }
}

class AssignLeft extends UserCoreGroup {
    get define() {
        return [
            CoreWhite.getOrCreate(),
            UserNonTerminal.getOrCreate(), 
            CoreWhite.getOrCreate(),
            CoreOption.getOrCreate (
                Parentheses.getOrCreate(
                    CoreAsterisk.getOrCreate(CoreWhite.getOrCreate(), Variable.getOrCreate(), CoreWhite.getOrCreate(), CoreTerminal.getOrCreate(',')), 
                    CoreWhite.getOrCreate(), CoreOption.getOrCreate(Variable.getOrCreate()),
                    CoreWhite.getOrCreate(),
                )
            ),
            CoreWhite.getOrCreate(),
        ];
    }
    static argNames(bnfAstNode) {
        bnfAstNode.assertBaseInstanceOf(this);
        const opt = bnfAstNode.children.find(t => t.baseType === CoreOption);
        if(opt.str === "") {
            return undefined;
        }
        return opt.dig(Variable);
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
            BnfOr.getOrCreate(RightValue, '|')
        ];
    }
    static getMostLeftNotNullableTerms(bnfAstNode) {
        const result = [];
        bnfAstNode.assertBaseInstanceOf(this);
        const or = bnfAstNode.children[0];
        const orCls = or.baseType;
        if(!orCls.candidates) {
            throw new CoreLayerError(`Static method ${orCls.name}.candicates(bnfAstNode) does not exist.`, NotImplementedError);
        }
        const rightValues = orCls.candidates(or);
        for(const rightValue of rightValues) {
            const terms = RightValue.getMostLeftNotNullableTerms(rightValue);
            for(const term of terms) {
                result.push(term);
            }
        }
        return result;
    }
    static getAllTerms(bnfAstNode) {
        const result = [];
        bnfAstNode.assertBaseInstanceOf(this);
        const or = bnfAstNode.children[0];
        const orCls = or.baseType;
        if(!orCls.candidates) {
            throw new CoreLayerError(`Static method ${orCls.name}.candicates(bnfAstNode) does not exist.`, NotImplementedError);
        }
        const rightValues = orCls.candidates(or);
        for(const rightValue of rightValues) {
            const terms = RightValue.getAllTerms(rightValue);
            for(const term of terms) {
                result.push(term);
            }
        }
        return result;
    }
}

class RightValue extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            CoreOption.getOrCreate(VariableDefault.getOrCreate()),
            UserPlus.getOrCreate(
                UserOr.getOrCreate(
                    MonoTerm.getOrCreate(),
                    Commands.getOrCreate(),
                ),
                CoreWhite.getOrCreate(CoreWhite.whiteExcluder),
            ),
        ];
    }
    static valids() {
        throw new CoreLayerError("This method must be not called.", Error);
    }
    static generateSecondaryParser(bnfAstNode) {
        bnfAstNode.assertBaseInstanceOf(this);
        const opt = bnfAstNode.children.find(t => t.baseType === CoreOption);
        const plus = bnfAstNode.children.find(t => t.baseType === UserPlus);
        plus.valids = [0];
        const parser = plus.generateSecondaryParser;
        const test = parser.test;
        const process = (astNode, strObj, result, seed) => {
            const child = parser.parse(strObj, seed);
            astNode.addChild(child.node);
            // デフォルト値を与えるトークンを生やす
            if(opt.count) {
                const variables = VariableDefault.getDefaults(opt.children[0]);
                for(const variable of variables) {
                    const {anchor, strObj, nonTerminal} = variable;
                    const result = nonTerminal.generateSecondaryParser.test(strObj, 0);
                    if(!result.success) {
                        throw new BnfLayerError("Default value define おかしい", SyntaxError);
                    }
                    const child = nonTerminal.generateSecondaryParser.parse(strObj);
                    child.node.setAnchor(anchor);
                    astNode.addChild(child.node);
                }
            }
        };
        return AstNode.parserWrapper(bnfAstNode, test, process);
    }
    static getMostLeftNotNullableTerms(bnfAstNode) {
        const result = [];
        bnfAstNode.assertBaseInstanceOf(this);
        const plus = bnfAstNode.children.find(t => t.baseType === UserPlus);
        const first = plus.children.find(child => !(child.isNullable));
        const notNullables = plus.children.filter(child => !(child.isNullable));
        const search = child => {
            if(!child) {
                return;
            }
            const assignRight = child.dig(AssignRight, true, 0, 1);
            if(assignRight.length) {
                const terms = AssignRight.getMostLeftNotNullableTerms(assignRight[0]);
                for(const term of terms) {
                    result.push(term);
                }
            } else {
                const rightElement = child.dig(RightElement, true, 1, 1)[0];
                const re = rightElement.children.find(c => c.baseType !== CoreWhite);
                result.push(re);
            }
        };
        for(const child of notNullables) {
            const mono = child.dig(MonoTerm);
            if(mono.length === 0) {
                continue;
            }
            search(child);
            break;
        }
        return result;
    }
    static getAllTerms(bnfAstNode) {
        const result = [];
        bnfAstNode.assertBaseInstanceOf(this);
        const plus = bnfAstNode.children.find(t => t.baseType === UserPlus);
        const children = plus.children;
        const search = child => {
            if(!child) {
                return;
            }
            const assignRight = child.dig(AssignRight, true, 0, 1);
            if(assignRight.length) {
                const terms = AssignRight.getAllTerms(assignRight[0]);
                for(const term of terms) {
                    result.push(term);
                }
            } else {
                const rightElement = child.dig(RightElement, true, 1, 1)[0];
                const re = rightElement.children.find(c => c.baseType !== CoreWhite);
                result.push(re);
            }
        };
        for(const child of children) {
            const mono = child.dig(MonoTerm);
            if(mono.length === 0) {
                continue;
            }
            search(child);
        }
        return result;
    }
}

class Argument extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            CoreOr.getOrCreate(
                Name.getOrCreate(),
                NumberTerminal.getOrCreate(),
            ),
        ];
    }
}

class Arguments extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            UserAsterisk.getOrCreate(
                Argument.getOrCreate(),
                CoreWhite.getOrCreate(CoreWhite.whiteExcluder),
                CoreTerminal.getOrCreate(','),
                CoreWhite.getOrCreate(CoreWhite.whiteExcluder),
            ),
            UserOption.getOrCreate(
                Argument.getOrCreate(),
                CoreWhite.getOrCreate(CoreWhite.whiteExcluder),
                UserOption.getOrCreate(
                    CoreTerminal.getOrCreate(','),
                    CoreWhite.getOrCreate(CoreWhite.whiteExcluder)
                ),
            ),
        ];
    }

}

class BaseCommander extends UserCoreGroup {
    static reuseable = true;
    static get command() {
        return "";
    }
    get define() {
        return [
            // コマンドはBNF上で静的に表現する．
            // 動的（最終コード上での）表現を許容すると字句解析や構文解析表の事前定義が不可能になる．
            CoreTerminal.getOrCreate('@'),
            CoreTerminal.getOrCreate(this.constructor.command),
            UserOption.getOrCreate(
                Parentheses.getOrCreate(Arguments.getOrCreate())
            )
        ];
    }
    static generateSecondaryParser(bnfAstNode) {
        bnfAstNode.assertBaseInstanceOf(this);
        const test = (strObj, index, seed) => {
            // 通常，コマンドは文字列を食べない．
            // 食べる場合は別途定義する．
            return {success: true, length: 0};
        };
        return AstNode.parserWrapper(bnfAstNode, test);
    }
    static getArguments(bnfAstNode) {
        const args = bnfAstNode.dig(Argument);
        return args;
    }
}

class ModeSwitcher extends BaseCommander {
    static get command() {
        return "mode";
    }
    static generateSecondaryParser(bnfAstNode) {
        bnfAstNode.assertBaseInstanceOf(this);
        const args = this.getArguments(bnfAstNode);
        const modeName = args[0]?.bnfStr;
        const entryPoint = args[1]?.bnfStr;
        if(modeName === undefined) {
            throw new BnfLayerError("Mode name is missing in mode-switch directive.", SyntaxError);
        }
        const mode = bnfAstNode.bnfAstManager.modeDeck.get(modeName);
        if(mode === undefined) {
            throw new BnfLayerError(`Mode not found: no rule set registered for mode < ${modeName}>.`, SyntaxError);
        }
        const switchedParser = mode.parser(entryPoint);
        const astManager = new AstManager;
        astManager.evaluators = mode.evaluators || new Map;
        astManager.peeks = mode.peeks || new Map;
        const strObjMemory = new Map;
        const getStrObj = (strObj, index = strObj.ptr) => {
            if(!strObjMemory.has(strObj)) {
                const strObjCache = new Map;
                strObjMemory.set(strObj, strObjCache);
            }
            const strObjCache = strObjMemory.get(strObj);
            if(!strObjCache.has(index)) {
                const newStrObj = new StringObject(strObj.read(index));
                strObjCache.set(index, newStrObj);
            }
            return strObjCache.get(index);
        }
        const test = (strObj, index, seed) => {
            // test側は新しいstrObjでなくても問題なく解析できるが，
            // Wrapperのキャッシュ機能を活かすためにparse側と共通のstrObjを提供する
            const newStrObj = getStrObj(strObj, index);
            return switchedParser.test(newStrObj, 0, seed);
        };
        const process = (astNode, strObj, result, seed) => {
            // RuleForger毎にStringObjectを新規に作ってあげないと文字の位置を正しく取得できない．
            const newStrObj = getStrObj(strObj);
            const parsed = switchedParser.parse(newStrObj);
            // switchedParserは元のstrObjを食べないので，strObjを手動で進める．
            strObj.shift(parsed.node.str.length);
            astNode.length = parsed.node.str.length;
            // TODO:モードスイッチ後の結果の扱いは要検討
            astManager.root = parsed.node;
            const val = astManager.root.evaluator.value;
            console.log(val);
        };
        return AstNode.parserWrapper(bnfAstNode, test, process);
    }
}

class Commands extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            UserOr.getOrCreate(
                ModeSwitcher.getOrCreate(),
            )
        ];
    }
}

class MonoTerm extends UserCoreGroup {
    static reuseable = true;
    static get lastTermCls() {
        return MyNegOperate;
    }
    get define() {
        return [
            UserOr.getOrCreate(
                MonoTerm.lastTermCls.getOrCreate(),
                Renamer.getOrCreate(MonoTerm.lastTermCls),
            )
        ];
    }
}

class RightElement extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
                CoreWhite.getOrCreate(CoreWhite.whiteExcluder),
                FirstOr.getOrCreate(
                    Token.getOrCreate(),
                    UserNonTerminal.getOrCreate(),
                    UserTerminals.getOrCreate(),
                    // AssignRight は再帰なので，遅延生成とする
                    LazyGenerator.getOrCreate(Parentheses, AssignRight),
                ),
                CoreWhite.getOrCreate(CoreWhite.whiteExcluder),
        ];
    }
    static valids() {
        return [1];
    }
    static generateEvaluator(astNode) {
        const selected = astNode.children[0].children[0];
        const selectedType = selected.instance.baseType;
        if(BnfAstNode.isSubClassOf(selectedType, Parentheses)) {
            return selected.children[0].evaluator;
        } else {
            return new Evaluator(selected);
        }
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
            CoreTerminalSet.getOrCreate(symbol, az, AZ), CoreAsterisk.getOrCreate(CoreTerminalSet.getOrCreate(symbol, az, AZ, digit))
        ];
    }
}

class VarName extends Name {
}

class NumberTerminal extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            CoreOr.getOrCreate(
                CorePlus.getOrCreate(
                    CoreTerminalSet.getOrCreate('0123456789'), 
                ),
                UserCoreGroup.getOrCreate(
                    CoreTerminal.getOrCreate("0x"),
                    CorePlus.getOrCreate(
                        CoreTerminalSet.getOrCreate('0123456789abcdefABCDEF'), 
                    ),
                ),
            ),
        ];
    }
}

class Parentheses extends UserCoreGroup {
    get define() {
        return [CoreTerminal.getOrCreate('('), CoreWhite.getOrCreate(), ...this.args, CoreWhite.getOrCreate(), CoreTerminal.getOrCreate(')')];
    }
    get isEnclosure() {
        return true;
    }
    static valids() {
        return [2];
    }
}

class UserNonTerminal extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            Name.getOrCreate(), 
            CoreAsterisk.getOrCreate(CoreWhite.getOrCreate(), CoreTerminal.getOrCreate(UserNonTerminal.selector), CoreWhite.getOrCreate(), Name.getOrCreate())
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

class Token extends CoreAstNode {
    testBnf(strObj, index) {
        return this.lexicalAnalyzer.testBnf(strObj, index);
    }
    static generateSecondaryParser(bnfAstNode) {
        const lexicalAnalyzer = bnfAstNode.instance.lexicalAnalyzer;
        const test = (strObj, index, seed) => {
            const result = lexicalAnalyzer.test(bnfAstNode, strObj, index, seed);
            return result;
        }
        const process = (astNode, strObj, result, seed) => {
            astNode.evaluate = ($, str) => {
                return Number(str);
            };
            return lexicalAnalyzer.process(bnfAstNode, astNode, strObj, result, seed);
        }
        return AstNode.parserWrapper(bnfAstNode, test, process);
    }
}

class Renamer extends UserCoreGroup {
    get define() {
        return [
            CoreTerminal.getOrCreate('$'), 
            CoreOption.getOrCreate(VarName.getOrCreate(), CoreWhite.getOrCreate(), CoreTerminal.getOrCreate(':'), CoreWhite.getOrCreate()),
            this.args[0].getOrCreate()
        ];
    }
    static get #reference() {
        return 2;
    }
    static valids(bnfAstNode) {
        return [this.#reference];
    }
    static generateSecondaryParser(bnfAstNode) {
        const parser = super.generateSecondaryParser(bnfAstNode);
        const opt = bnfAstNode.children.find(t => t.baseType === CoreOption);
        const anchor = (() => {
            if(opt.count) {
                return opt.children[0].children[0].bnfStr;
            }
            const token = bnfAstNode.children[this.#reference].dig(Token, true, 0, 1, new BnfLayerError("Alter name setting error.", SyntaxError))[0];
            if(token) {
                return token.bnfStr;
            }
            const nonTerminal = bnfAstNode.children[this.#reference].dig(UserNonTerminal, true, 1, 1, new BnfLayerError("Alter name setting error.", SyntaxError))[0];
            return UserNonTerminal.nameHierarchy(nonTerminal).map(t => t.bnfStr).join(UserNonTerminal.selector);
        })();
        const newProcess = (astNode, strObj, result, seed) => {
            parser.process(astNode, strObj, result, seed);
            if(anchor !== null) {
                astNode.setAnchor(anchor);
            }
        };
        return AstNode.parserWrapper(bnfAstNode, parser.test, newProcess);
    }
}

class Variable extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [CoreTerminal.getOrCreate('$'), VarName.getOrCreate()]
    }
    static getAnchor(bnfAstNode) {
        if(bnfAstNode.children) {
            return bnfAstNode.children[1].bnfStr;
        }
        return undefined;
    }
}

class VariableDefault extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            CoreTerminal.getOrCreate('{'), CoreWhite.getOrCreate(), 
            CoreAsterisk.getOrCreate(DefaultValue.getOrCreate(), CoreWhite.getOrCreate(), CoreTerminal.getOrCreate(','), CoreWhite.getOrCreate()),
            CoreOption.getOrCreate(DefaultValue.getOrCreate(), CoreWhite.getOrCreate()), 
            CoreTerminal.getOrCreate('}'), CoreWhite.getOrCreate(), 
        ]
    }
    static getDefaults(bnfAstNode) {
        bnfAstNode.assertBaseInstanceOf(this);
        const defaults = [];
        const ast = bnfAstNode.children.find(t => t.baseType === CoreAsterisk);
        const opt = bnfAstNode.children.find(t => t.baseType === CoreOption);
        for(const child of ast.children) {
            const bnfAstNode = child.dig(DefaultValue, 1, 1, 1)[0];
            const defaultVal = DefaultValue.getDefault(bnfAstNode);
            defaults.push(defaultVal);
        }
        {
            const bnfAstNode = opt.dig(DefaultValue, 1, 1, 1)[0];
            if(bnfAstNode) {
                const defaultVal = DefaultValue.getDefault(bnfAstNode);
                defaults.push(defaultVal);    
            }
        }
        return defaults;
    }
}

class DefaultValue extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            CoreTerminal.getOrCreate('$'), 
            CoreOption.getOrCreate(VarName.getOrCreate(), CoreWhite.getOrCreate(), CoreTerminal.getOrCreate(':'), CoreWhite.getOrCreate()), 
            UserNonTerminal.getOrCreate(), CoreWhite.getOrCreate(), CoreTerminal.getOrCreate('('), CoreWhite.getOrCreate(), 
            CoreTerminal.getOrCreate('`'),
            CoreAsterisk.getOrCreate(
                CoreOr.getOrCreate(
                    CoreNegTerminalSet.getOrCreate('`\\'), 
                    CoreGroup.getOrCreate(CoreTerminal.getOrCreate('\\'), CoreTerminalDot.getOrCreate())
                )
            ),
            CoreTerminal.getOrCreate('`'), CoreWhite.getOrCreate(), 
            CoreWhite.getOrCreate(), CoreTerminal.getOrCreate(')'),
        ]
    }
    static valids() {
        return [2];
    }
    static getDefault(bnfAstNode) {
        bnfAstNode.assertBaseInstanceOf(this);
        const opt = bnfAstNode.children.find(c => c.baseType === CoreOption);
        const nonTerminal = bnfAstNode.children.find(c => c.baseType === UserNonTerminal);
        const ast = bnfAstNode.children.find(c => c.baseType === CoreAsterisk);
        const nonTermName = UserNonTerminal.nameHierarchy(nonTerminal).map(t => t.bnfStr).join(UserNonTerminal.selector);
        const anchor = (() => {
            if(opt.count) {
                return opt.children[0].children[0].bnfStr;
            }
            return nonTermName;
        })();
        const strObj = new StringObject(ast.bnfStr);
        return {anchor, strObj, nonTerminal};
    }
}

class MyNegOperate extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            UserOr.getOrCreate(
                MyRepeaterSet.getOrCreate(),
                UserCoreGroup.getOrCreate(CoreTerminal.getOrCreate('!'), MyRepeaterSet.getOrCreate())
            )
        ];
    }
    static generateSecondaryParser(bnfAstNode) {
        const or = bnfAstNode.children[0];
        const child = or.children[0];
        const parser = (() => {
            if(child.baseType === MyRepeaterSet) {
                return child.baseType.generateSecondaryParser(bnfAstNode);
            }
            child.valids = [1];
            const parser = super.generateSecondaryParser(bnfAstNode);
            const test = (strObj, index, seed) => {
                const result = parser.test(strObj, index, seed);
                if(result.success) {
                    return {
                        success: false,
                        length: undefined,
                    }
                }
                return {
                    success: true,
                    length: 0,
                }
            };
            const process = (astNode) => {
                astNode.assertion = true;
                astNode.match = true;
            };
            return AstNode.parserWrapper(bnfAstNode, test, process);
        })();
        return parser;
    }
    static generateEvaluator(astNode) {
        if(astNode.assertion) {
            return new Evaluator(astNode.match);
        }
        return super.generateEvaluator(astNode);
    }
}

class MyRepeaterSet extends UserCoreGroup {
    get define() {
        return [
            UserOr.getOrCreate(
                RightElement.getOrCreate(),
                MyAsterisk.getOrCreate(RightElement),
                MyPlus.getOrCreate(RightElement),
                MyOption.getOrCreate(RightElement),
                MyRepeaterSample.getOrCreate(RightElement),
            )
        ];
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
    constructor(...args) {
        super(...args);
        this.min = 0;
        this.max = Infinity;
    }
}

class UserOption extends UserRepeater {
    constructor(...args) {
        if(args.length > 1) {
            args = [CoreGroup.getOrCreate(...args)];
        }
        super(...args);
        this.min = 0;
        this.max = 1;
    }
}

class UserPlus extends UserRepeater {
    constructor(...args) {
        super(...args);
        this.min = 1;
        this.max = Infinity;
    }
}

// 自作BNF解釈用の繰り返し表現定義用のクラス
class MyRepeater extends AbstractRepeater {
    #elemType;
    constructor(elemType) {
        super();
        this.#elemType = elemType;
    }
    get elemType() {
        return this.#elemType;
    }
    static valids() {
        return [0];
    }
    static generateSecondaryParser(bnfAstNode) {
        const bnfChild = bnfAstNode.children.find(t => t.baseType === bnfAstNode.instance.#elemType);
        const parser = bnfChild.generateSecondaryParser;
        const test = (strObj, index, seed) => {
            let length = 0;
            let count = 0;
            while(1) {
                const result = parser.test(strObj, index + length, seed);
                if(result.success === false || result.length === 0) {
                    break;
                }
                length += result.length;
                count++;
                if(count >= bnfAstNode.baseType.max(bnfAstNode)) {
                    break;
                }
            }
            if(count >= bnfAstNode.baseType.min(bnfAstNode)) {
                return {
                    success: true,
                    length,
                    count
                };
            }
            return {
                success: false,
                length: undefined,
                count
            };
        };
        const process = (astNode, strObj, result, seed) => {
            for(let i = 0; i < result.count; i++) {
                const child = parser.parse(strObj, seed);
                astNode.addChild(child.node);
            }
        };
        return AstNode.parserWrapper(bnfAstNode, test, process);
    }
    get isMyRepeater() {
        return true;
    }

    static generateEvaluator(astNode) {
        return new Evaluator(astNode.children.map(child => child.evaluator));
    }
    static min(bnfAstNode) {
        return 0;
    }
    static max(bnfAstNode) {
        return Infinity;
    }
}

class MyAsterisk extends MyRepeater {
    get define() {
        return [
            this.elemType.getOrCreate(), CoreTerminal.getOrCreate('*')
        ];
    }
    static min(bnfAstNode) {
        return 0;
    }
    static max(bnfAstNode) {
        return Infinity;
    }
}

class MyPlus extends MyRepeater {
    get define() {
        return [
            this.elemType.getOrCreate(), CoreTerminal.getOrCreate('+')
        ];
    }
    static min(bnfAstNode) {
        return 1;
    }
    static max(bnfAstNode) {
        return Infinity;
    }
}

class MyOption extends MyRepeater {
    get define() {
        return [
            this.elemType.getOrCreate(), CoreTerminal.getOrCreate('?')
        ];
    }
    static min(bnfAstNode) {
        return 0;
    }
    static max(bnfAstNode) {
        return 1;
    }
}

class MyRepeaterSample extends MyRepeater {
    get define() {
        return [
            // このサンプルだと最小値，最大値ともに1桁しか指定できない．
            this.elemType.getOrCreate(), CoreTerminal.getOrCreate('{'), CoreWhite.getOrCreate(), CoreTerminalSet.getOrCreate('0123456789'), CoreWhite.getOrCreate(), CoreTerminal.getOrCreate(','), CoreWhite.getOrCreate(),CoreTerminalSet.getOrCreate('0123456789'),CoreWhite.getOrCreate(), CoreTerminal.getOrCreate('}')
        ];
    }
    static min(bnfAstNode) {
        // digを使うとelemType内にあるCoreTerminalSetも拾う可能性があるので，全数拾って後ろから探す．
        const min = bnfAstNode.dig(CoreTerminalSet).slice(-2)[0];
        return Number(min.str);
    }
    static max(bnfAstNode) {
        // digを使うとelemType内にあるCoreTerminalSetも拾う可能性があるので，全数拾って後ろから探す．
        const max = bnfAstNode.dig(CoreTerminalSet).slice(-1)[0];
        return Number(max.str);
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

class FirstOr extends UserOr {
    get selectLogic() {
        return SelectLogic.first;
    }
}

class BnfOr extends UserCoreGroup {
    get candidate() {
        return this.args[0];
    }
    get operator() {
        return this.args[1];
    }
    get define() {
        return [
            this.candidate.getOrCreate(),
            CoreWhite.getOrCreate(CoreWhite.whiteExcluder),
            CoreAsterisk.getOrCreate(
                CoreWhite.getOrCreate(),
                CoreTerminal.getOrCreate(this.operator),
                CoreWhite.getOrCreate(),
                this.candidate.getOrCreate(), 
                CoreWhite.getOrCreate(CoreWhite.whiteExcluder),
            )
        ];
    }
    static candidates(bnfAstNode, exclude = new Set) {
        const candidateType = bnfAstNode.instance.candidate;
        const c = bnfAstNode.children.find(t => t.baseType === candidateType);
        const ast = bnfAstNode.children.find(t => t.baseType === CoreAsterisk);
        const defines = [c];
        for(const child of ast.children) {
            const c = child.children.find(t => t.baseType === candidateType);
            defines.push(c);
        }
        return defines.filter(n => !exclude.has(n));
    }
    static generateSecondaryParser(bnfAstNode, exclude = new Set) {
        bnfAstNode.assertBaseInstanceOf(this);
        const candidates = this.candidates(bnfAstNode, exclude);
        const parsers = candidates.map(t => t.generateSecondaryParser);
        const test = (strObj, index, seed) => {
            const lens = parsers.map(parser => parser.test(strObj, index, seed));
            return (() => {
                const max = {
                    success: false,
                    length: undefined,
                    candidate: undefined,
                };
                const first = {
                    success: false,
                    length: undefined,
                    candidate: undefined,
                };
                for(const [i, len] of lens.entries()) {
                    if(!len.success) {
                        continue
                    }
                    if((!max.success) || (max.length < len.length)) {
                        max.success = true;
                        max.length = len.length;
                        max.candidate = candidates[i];
                        max.parser = parsers[i];
                    }
                    if(!first.success) {
                        first.success = true;
                        first.length = len.length;
                        first.candidate = candidates[i];
                        first.parser = parsers[i];
                        if(bnfAstNode.bnfAstManager.selectLogic === SelectLogic.first) {
                            return first;
                        }
                    }
                }
                return max;
            })();
        };
        const process = (astNode, strObj, result, seed) => {
            const decided = result.parser;
            const child = decided.parse(strObj, seed);
            astNode.addChild(child.node);
            return;
        };
        return AstNode.parserWrapper(bnfAstNode, test, process);
    }
    // 左再帰解決用関数
    static generateSecondaryParserWithout(bnfAstNode) {
        return (exclude) => {
            if(exclude instanceof Array) {
                exclude = new Set(exclude);
            }
            return this.generateSecondaryParser(bnfAstNode, exclude);
        };
    }
}
class MyOr extends BnfOr {
}

class UserTerminals extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            UserOr.getOrCreate(
                UserTerminal.getOrCreate(),
                NoCaseTerminal.getOrCreate(),
                MyTerminalSet.getOrCreate(),
            )
        ];
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
        const escape = this.escape.getOrCreate();
        return [
            CoreTerminal.getOrCreate(this.bracket[0]), 
            CoreAsterisk.getOrCreate(CoreOr.getOrCreate(CoreNegTerminalSet.getOrCreate(this.bracket[1], escape.escapeChar), escape)), 
            CoreTerminal.getOrCreate(this.bracket[1]),
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

class NoCaseTerminal extends UserTerminal {
    get bracket() {
        return ['i"', '"'];
    }
    static terminalTest(strObj, index, bnfAstNode, seed) {
        const str = this.targetString(bnfAstNode);
        const start = index;
        const target = strObj.read(start, str.length);
        if(str.toLowerCase() === target.toLowerCase()) {
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
}

class MyTerminalSet extends UserTerminal {
    get bracket() {
        return ["'", "'"];
    }
    static terminalTest(strObj, index, bnfAstNode, seed) {
        const strs = new Set(this.targetString(bnfAstNode).split(''));
        const start = index;
        const length = start < index ? 0 : 1; 
        const target = strObj.read(start, 1);
        if(strs.has(target)) {
            return {
                success: true,
                length: length,
            };
        }
        return {
            success: false,
            length: undefined
        }
    }
}

class UserEscape extends UserCoreGroup {
    static reuseable = true;
    get escapeChar() {
        return '\\';
    }
    get define() {
        return [CoreTerminal.getOrCreate(this.escapeChar), CoreTerminalDot.getOrCreate()];
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

module.exports = {
    CoreEntryPoint,
    UserNonTerminal,
    Name,
    Assign,
    AssignRight,
    AssignLeft,
    RightValue
};
