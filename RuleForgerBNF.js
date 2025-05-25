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
    UserRepeater,
    UserAsterisk,
    UserOption,
    UserPlus,
    UserOr,
    FirstOr,
    UserTerminal,
    UserEscape,
} = require('./common.js');
const {
    LexicalAnalyzer
} = require('./LexicalAnalyzer.js');
const {NotImplementedError, CoreLayerError, BnfLayerError, RuntimeLayerError, UncategorizedLayerError} = require('./Error.js');

class CoreEntryPoint extends CoreGroup {
    // BNF読む時点ではBnfAstManager等はいないので，
    // エントリポイント自体でLexicalAnalyzerを持つ．（= RuleForger毎にLexicalAnalyzerを持っている）
    get define() {
        return [CoreAsterisk.getOrCreate(this.parserGenerator, CoreExpr.getOrCreate(this.parserGenerator, ))];
    }
    set token(val) {
        this.lexicalAnalyzer.token = val;
    }
    constructor(parserGenerator) {
        super(parserGenerator);
        this.lexicalAnalyzer = new LexicalAnalyzer();
    }
}

class CoreExpr extends CoreGroup {
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
        return '=';
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
    static generateAssignFromLeftRightStr(left, right, parserGenerator) {
        const strObj = new StringObject(left + this.operator + right);
        const assignRule = Assign.getOrCreate(parserGenerator);
        if(!assignRule.lexicalAnalyzer) {
            assignRule.lexicalAnalyzer = parserGenerator.lexicalAnalyzer;
        }
        const bnfAstNode = assignRule.primaryParser.parse(strObj).node;
        return bnfAstNode;
    }
}

class AssignLeft extends UserCoreGroup {
    get define() {
        return [
            CoreWhite.getOrCreate(this.parserGenerator, ),
            MyNonTerminal.getOrCreate(this.parserGenerator, ), 
            CoreWhite.getOrCreate(this.parserGenerator, ),
            CoreOption.getOrCreate(this.parserGenerator, 
                Parentheses.getOrCreate(this.parserGenerator, 
                    CoreAsterisk.getOrCreate(this.parserGenerator, CoreWhite.getOrCreate(this.parserGenerator, ), Variable.getOrCreate(this.parserGenerator, ), CoreWhite.getOrCreate(this.parserGenerator, ), CoreTerminal.getOrCreate(this.parserGenerator, ',')), 
                    CoreWhite.getOrCreate(this.parserGenerator, ), CoreOption.getOrCreate(this.parserGenerator, Variable.getOrCreate(this.parserGenerator, )),
                    CoreWhite.getOrCreate(this.parserGenerator, ),
                )
            ),
            CoreWhite.getOrCreate(this.parserGenerator, ),
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
        const hierarchies = bnfAstNode.dig(MyNonTerminal, true, 1, 1);
        return MyNonTerminal.nameHierarchy(hierarchies[0]);
    }
}

class AssignRight extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            BnfOr.getOrCreate(this.parserGenerator, RightValue, '|')
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
            CoreOption.getOrCreate(this.parserGenerator, VariableDefault.getOrCreate(this.parserGenerator, )),
            UserPlus.getOrCreate(this.parserGenerator, 
                UserOr.getOrCreate(this.parserGenerator, 
                    MonoTerm.getOrCreate(this.parserGenerator, ),
                    Commands.getOrCreate(this.parserGenerator, ),
                    Renamer.getOrCreate(this.parserGenerator, Commands),
                ),
                CoreWhite.getOrCreate(this.parserGenerator, CoreWhite.whiteExcluder),
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
            CoreOr.getOrCreate(this.parserGenerator, 
                Name.getOrCreate(this.parserGenerator, ),
                NumberTerminal.getOrCreate(this.parserGenerator, ),
            ),
        ];
    }
}

class Arguments extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            UserAsterisk.getOrCreate(this.parserGenerator, 
                Argument.getOrCreate(this.parserGenerator, ),
                CoreWhite.getOrCreate(this.parserGenerator, CoreWhite.whiteExcluder),
                CoreTerminal.getOrCreate(this.parserGenerator, ','),
                CoreWhite.getOrCreate(this.parserGenerator, CoreWhite.whiteExcluder),
            ),
            UserOption.getOrCreate(this.parserGenerator, 
                Argument.getOrCreate(this.parserGenerator, ),
                CoreWhite.getOrCreate(this.parserGenerator, CoreWhite.whiteExcluder),
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
            CoreTerminal.getOrCreate(this.parserGenerator, '@'),
            CoreTerminal.getOrCreate(this.parserGenerator, this.constructor.command),
            UserOption.getOrCreate(this.parserGenerator, 
                Parentheses.getOrCreate(this.parserGenerator, Arguments.getOrCreate(this.parserGenerator, ))
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
            astManager.root = parsed.node;
            // モードスイッチ後の結果取得は管理クラス等の縁切りを確実に行うため
            // evaluatorsを経由せずevaluateを直接定義する．
            astNode.evaluate = ($, str) => {
                return astManager.root.evaluator.value;;
            };
        };
        return AstNode.parserWrapper(bnfAstNode, test, process);
    }
    static generateEvaluator(astNode) {
        return new Evaluator(astNode);
    }
}

class Commands extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            UserOr.getOrCreate(this.parserGenerator, 
                ModeSwitcher.getOrCreate(this.parserGenerator, ),
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
            UserOr.getOrCreate(this.parserGenerator, 
                MonoTerm.lastTermCls.getOrCreate(this.parserGenerator, ),
                Renamer.getOrCreate(this.parserGenerator, MonoTerm.lastTermCls),
            )
        ];
    }
}

class RightElement extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
                CoreWhite.getOrCreate(this.parserGenerator, CoreWhite.whiteExcluder),
                FirstOr.getOrCreate(this.parserGenerator, 
                    Token.getOrCreate(this.parserGenerator, ),
                    MyNonTerminal.getOrCreate(this.parserGenerator, ),
                    MyTerminals.getOrCreate(this.parserGenerator, ),
                    // AssignRight は再帰なので，遅延生成とする
                    LazyGenerator.getOrCreate(this.parserGenerator, Parentheses, AssignRight),
                ),
                CoreWhite.getOrCreate(this.parserGenerator, CoreWhite.whiteExcluder),
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
            CoreTerminalSet.getOrCreate(this.parserGenerator, symbol, az, AZ), CoreAsterisk.getOrCreate(this.parserGenerator, CoreTerminalSet.getOrCreate(this.parserGenerator, symbol, az, AZ, digit))
        ];
    }
}

class VarName extends Name {
}

class NumberTerminal extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            CoreOr.getOrCreate(this.parserGenerator, 
                CorePlus.getOrCreate(this.parserGenerator, 
                    CoreTerminalSet.getOrCreate(this.parserGenerator, '0123456789'), 
                ),
                UserCoreGroup.getOrCreate(this.parserGenerator, 
                    CoreTerminal.getOrCreate(this.parserGenerator, "0x"),
                    CorePlus.getOrCreate(this.parserGenerator, 
                        CoreTerminalSet.getOrCreate(this.parserGenerator, '0123456789abcdefABCDEF'), 
                    ),
                ),
            ),
        ];
    }
}

class Parentheses extends UserCoreGroup {
    get define() {
        return [CoreTerminal.getOrCreate(this.parserGenerator, '('), CoreWhite.getOrCreate(this.parserGenerator, ), ...this.args, CoreWhite.getOrCreate(this.parserGenerator, ), CoreTerminal.getOrCreate(this.parserGenerator, ')')];
    }
    get isEnclosure() {
        return true;
    }
    static valids() {
        return [2];
    }
}

class MyNonTerminal extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            Name.getOrCreate(this.parserGenerator, ), 
            CoreAsterisk.getOrCreate(this.parserGenerator, CoreWhite.getOrCreate(this.parserGenerator, ), CoreTerminal.getOrCreate(this.parserGenerator, MyNonTerminal.selector), CoreWhite.getOrCreate(this.parserGenerator, ), Name.getOrCreate(this.parserGenerator, ))
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
    static reuseable = true;    
    testBnf(strObj, index) {
        if(!this.lexicalAnalyzer) {
            return {
                success: false,
            };
        }
        return this.lexicalAnalyzer.testBnf(strObj, index);
    }
    static generateSecondaryParser(bnfAstNode) {
        const lexicalAnalyzer = bnfAstNode.instance.lexicalAnalyzer;
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
            const newStrObj = getStrObj(strObj, index);
            const result = lexicalAnalyzer.test(bnfAstNode, newStrObj, 0, seed);
            return result;
        }
        const process = (astNode, strObj, result, seed) => {
            const newStrObj = getStrObj(strObj, strObj.ptr);
            lexicalAnalyzer.process(bnfAstNode, astNode, newStrObj, result, seed);
            strObj.shift(result.length);
            astNode.length = result.length;
        }
        return AstNode.parserWrapper(bnfAstNode, test, process);
    }
}

class Renamer extends UserCoreGroup {
    get define() {
        return [
            CoreTerminal.getOrCreate(this.parserGenerator, '$'), 
            CoreOption.getOrCreate(this.parserGenerator, VarName.getOrCreate(this.parserGenerator, ), CoreWhite.getOrCreate(this.parserGenerator, ), CoreTerminal.getOrCreate(this.parserGenerator, ':'), CoreWhite.getOrCreate(this.parserGenerator, )),
            this.args[0].getOrCreate(this.parserGenerator, )
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
            const token = bnfAstNode.children[this.#reference].dig(Token, true, 0, 1, "Alter name setting error.", SyntaxError)[0];
            if(token) {
                return token.bnfStr;
            }
            const nonTerminal = bnfAstNode.children[this.#reference].dig(MyNonTerminal, true, 1, 1, "Alter name setting error.", SyntaxError)[0];
            return MyNonTerminal.nameHierarchy(nonTerminal).map(t => t.bnfStr).join(MyNonTerminal.selector);
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
        return [CoreTerminal.getOrCreate(this.parserGenerator, '$'), VarName.getOrCreate(this.parserGenerator, )]
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
            CoreTerminal.getOrCreate(this.parserGenerator, '{'), CoreWhite.getOrCreate(this.parserGenerator, ), 
            CoreAsterisk.getOrCreate(this.parserGenerator, DefaultValue.getOrCreate(this.parserGenerator, ), CoreWhite.getOrCreate(this.parserGenerator, ), CoreTerminal.getOrCreate(this.parserGenerator, ','), CoreWhite.getOrCreate(this.parserGenerator, )),
            CoreOption.getOrCreate(this.parserGenerator, DefaultValue.getOrCreate(this.parserGenerator, ), CoreWhite.getOrCreate(this.parserGenerator, )), 
            CoreTerminal.getOrCreate(this.parserGenerator, '}'), CoreWhite.getOrCreate(this.parserGenerator, ), 
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
            CoreTerminal.getOrCreate(this.parserGenerator, '$'), 
            CoreOption.getOrCreate(this.parserGenerator, VarName.getOrCreate(this.parserGenerator, ), CoreWhite.getOrCreate(this.parserGenerator, ), CoreTerminal.getOrCreate(this.parserGenerator, ':'), CoreWhite.getOrCreate(this.parserGenerator, )), 
            MyNonTerminal.getOrCreate(this.parserGenerator, ), CoreWhite.getOrCreate(this.parserGenerator, ), CoreTerminal.getOrCreate(this.parserGenerator, '('), CoreWhite.getOrCreate(this.parserGenerator, ), 
            CoreTerminal.getOrCreate(this.parserGenerator, '`'),
            CoreAsterisk.getOrCreate(this.parserGenerator, 
                CoreOr.getOrCreate(this.parserGenerator, 
                    CoreNegTerminalSet.getOrCreate(this.parserGenerator, '`\\'), 
                    CoreGroup.getOrCreate(this.parserGenerator, CoreTerminal.getOrCreate(this.parserGenerator, '\\'), CoreTerminalDot.getOrCreate(this.parserGenerator, ))
                )
            ),
            CoreTerminal.getOrCreate(this.parserGenerator, '`'), CoreWhite.getOrCreate(this.parserGenerator, ), 
            CoreWhite.getOrCreate(this.parserGenerator, ), CoreTerminal.getOrCreate(this.parserGenerator, ')'),
        ]
    }
    static valids() {
        return [2];
    }
    static getDefault(bnfAstNode) {
        bnfAstNode.assertBaseInstanceOf(this);
        const opt = bnfAstNode.children.find(c => c.baseType === CoreOption);
        const nonTerminal = bnfAstNode.children.find(c => c.baseType === MyNonTerminal);
        const ast = bnfAstNode.children.find(c => c.baseType === CoreAsterisk);
        const nonTermName = MyNonTerminal.nameHierarchy(nonTerminal).map(t => t.bnfStr).join(MyNonTerminal.selector);
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
            UserOr.getOrCreate(this.parserGenerator, 
                MyRepeaterSet.getOrCreate(this.parserGenerator, ),
                UserCoreGroup.getOrCreate(this.parserGenerator, CoreTerminal.getOrCreate(this.parserGenerator, '!'), MyRepeaterSet.getOrCreate(this.parserGenerator, ))
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
            UserOr.getOrCreate(this.parserGenerator, 
                RightElement.getOrCreate(this.parserGenerator, ),
                MyAsterisk.getOrCreate(this.parserGenerator, RightElement),
                MyPlus.getOrCreate(this.parserGenerator, RightElement),
                MyOption.getOrCreate(this.parserGenerator, RightElement),
                MyRepeaterSample.getOrCreate(this.parserGenerator, RightElement),
            )
        ];
    }
}

// 自作BNF解釈用の繰り返し表現定義用のクラス
class MyRepeater extends AbstractRepeater {
    #elemType;
    constructor(parserGenerator, elemType) {
        super(parserGenerator);
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
            this.elemType.getOrCreate(this.parserGenerator, ), CoreTerminal.getOrCreate(this.parserGenerator, '*')
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
            this.elemType.getOrCreate(this.parserGenerator, ), CoreTerminal.getOrCreate(this.parserGenerator, '+')
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
            this.elemType.getOrCreate(this.parserGenerator, ), CoreTerminal.getOrCreate(this.parserGenerator, '?')
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
            this.elemType.getOrCreate(this.parserGenerator, ), CoreTerminal.getOrCreate(this.parserGenerator, '{'), CoreWhite.getOrCreate(this.parserGenerator, ), CoreTerminalSet.getOrCreate(this.parserGenerator, '0123456789'), CoreWhite.getOrCreate(this.parserGenerator, ), CoreTerminal.getOrCreate(this.parserGenerator, ','), CoreWhite.getOrCreate(this.parserGenerator, ),CoreTerminalSet.getOrCreate(this.parserGenerator, '0123456789'),CoreWhite.getOrCreate(this.parserGenerator, ), CoreTerminal.getOrCreate(this.parserGenerator, '}')
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

class BnfOr extends UserCoreGroup {
    get candidate() {
        return this.args[0];
    }
    get operator() {
        return this.args[1];
    }
    get define() {
        return [
            this.candidate.getOrCreate(this.parserGenerator, ),
            CoreWhite.getOrCreate(this.parserGenerator, CoreWhite.whiteExcluder),
            CoreAsterisk.getOrCreate(this.parserGenerator, 
                CoreWhite.getOrCreate(this.parserGenerator, ),
                CoreTerminal.getOrCreate(this.parserGenerator, this.operator),
                CoreWhite.getOrCreate(this.parserGenerator, ),
                this.candidate.getOrCreate(this.parserGenerator, ), 
                CoreWhite.getOrCreate(this.parserGenerator, CoreWhite.whiteExcluder),
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

class MyTerminals extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            UserOr.getOrCreate(this.parserGenerator, 
                UserTerminal.getOrCreate(this.parserGenerator, ),
                NoCaseTerminal.getOrCreate(this.parserGenerator, ),
                MyTerminalSet.getOrCreate(this.parserGenerator, ),
            )
        ];
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

module.exports = {
    CoreEntryPoint,
    MyNonTerminal,
    Name,
    Assign,
    AssignRight,
    AssignLeft,
    RightValue
};
