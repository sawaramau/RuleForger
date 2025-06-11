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
    AbstractManager,
    CoreList,
    UserList,
    Parentheses,
    Braces,
} = require('./common.js');
const {
    LexicalAnalyzer
} = require('./LexicalAnalyzer.js');
const {
    NotImplementedError, 
    CoreLayerError, 
    BnfLayerError, 
    RuntimeLayerError, 
    SyntaxLayerError,
    UncategorizedLayerError,
    logContextOnly,
} = require('./Error.js');

class CoreEntryPoint extends CoreGroup {
    // BNF読む時点ではBnfAstManager等はいないので，
    // エントリポイント自体でLexicalAnalyzerを持つ．（= RuleForger毎にLexicalAnalyzerを持っている）
    get define() {
        return [CoreAsterisk.getOrCreate(this.parserGenerator, CoreExpr.getOrCreate(this.parserGenerator))];
    }
    set token(val) {
        this.lexicalAnalyzer.token = val;
    }
    constructor(parserGenerator) {
        super(parserGenerator);
        this.lexicalAnalyzer = new LexicalAnalyzer();
    }
    dump() {
        this.recursive(node => {
            if(node === LazyGenerator) {
                return node;
            }
            node.operands;
            return false;
        });
        AbstractManager.dump([this], {excluder: node => {
            return node instanceof CoreWhite || 
            node instanceof CoreTerminal || 
            node instanceof UserEscape || 
            node.parent instanceof MyTerminals ||
            (node instanceof MyRepeater && !(node instanceof MyAsterisk));
        }});
    }
}

class CoreExpr extends CoreGroup {
    get define() {
        return [
            CoreOr.getOrCreate(this.parserGenerator, 
                Assign.getOrCreate(this.parserGenerator), 
                CoreOr.getOrCreate(this.parserGenerator, 
                    CoreTerminal.getOrCreate(this.parserGenerator, ';'), 
                    CoreTerminal.getOrCreate(this.parserGenerator, '\n')
                ), 
                CoreWhite.getOrCreate(this.parserGenerator)
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
            AssignLeft.getOrCreate(this.parserGenerator), CoreWhite.getOrCreate(this.parserGenerator), 
            CoreTerminal.getOrCreate(this.parserGenerator, Assign.operator), CoreWhite.getOrCreate(this.parserGenerator), 
            AssignRight.getOrCreate(this.parserGenerator), CoreWhite.getOrCreate(this.parserGenerator), 
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
            CoreWhite.getOrCreate(this.parserGenerator),
            MyNonTerminal.getOrCreate(this.parserGenerator), 
            CoreWhite.getOrCreate(this.parserGenerator),
            CoreOption.getOrCreate(this.parserGenerator, 
                Parentheses.getOrCreate(this.parserGenerator, 
                    CoreList.getOrCreate(this.parserGenerator, (generator) => Variable.getOrCreate(generator)),
                )
            ),
            CoreWhite.getOrCreate(this.parserGenerator),
        ];
    }
    static argNames(bnfAstNode) {
        bnfAstNode.assertBaseInstanceOf(this);
        const list = bnfAstNode.children[3].digOne(CoreList);
        if(list === undefined) {
            return undefined;
        }
        const vars = list.dig(Variable);
        return vars;
    }
    static nameHierarchy(bnfAstNode) {
        bnfAstNode.assertBaseInstanceOf(this);
        const hierarchies = bnfAstNode.digOne(MyNonTerminal, {required:1});
        return MyNonTerminal.nameHierarchy(hierarchies);
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
            CoreOption.getOrCreate(this.parserGenerator, VariableDefault.getOrCreate(this.parserGenerator)),
            UserPlus.getOrCreate(this.parserGenerator, 
                UserOr.getOrCreate(this.parserGenerator, 
                    MonoTerm.getOrCreate(this.parserGenerator),
                    Commands.getOrCreate(this.parserGenerator),
                    Renamer.getOrCreate(this.parserGenerator, Commands),
                ),
                CoreWhite.getOrCreate(this.parserGenerator, CoreWhite.whiteExcluder),
            ),
        ];
    }
    static valids() {
        throw new CoreLayerError("This method must be not called.", Error);
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
            const assignRight = child.digOne(AssignRight, {required: false});
            if(assignRight) {
                const terms = AssignRight.getMostLeftNotNullableTerms(assignRight);
                for(const term of terms) {
                    result.push(term);
                }
            } else {
                const rightElement = child.digOne(RightElement, {required: true});
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
            const assignRight = child.digOne(AssignRight, {required: false});
            if(assignRight) {
                const terms = AssignRight.getAllTerms(assignRight);
                for(const term of terms) {
                    result.push(term);
                }
            } else {
                const rightElement = child.digOne(RightElement, {required: true});
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
    static LL = class extends this.superCls {
        static generateSecondaryParser(bnfAstNode) {
            bnfAstNode.assertBaseInstanceOf(RightValue);
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
    };
}

class Argument extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            CoreOr.getOrCreate(this.parserGenerator, 
                Name.getOrCreate(this.parserGenerator),
                NumberTerminal.getOrCreate(this.parserGenerator),
                Reference.getOrCreate(this.parserGenerator),
            ),
        ];
    }
}

class Arguments extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            CoreList.getOrCreate(this.parserGenerator, generator => Argument.getOrCreate(generator))
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
            CoreOption.getOrCreate(this.parserGenerator, 
                Parentheses.getOrCreate(this.parserGenerator, Arguments.getOrCreate(this.parserGenerator))
            )
        ];
    }
    static LL = class extends this.superCls {
        static generateSecondaryParser(bnfAstNode) {
            bnfAstNode.assertBaseInstanceOf(BaseCommander);
            const test = (strObj, index, seed) => {
                // 通常，コマンドは文字列を食べない．
                // 食べる場合は別途定義する．
                return {success: true, length: 0};
            };
            return AstNode.parserWrapper(bnfAstNode, test);
        }
    };
    static getArguments(bnfAstNode) {
        const args = bnfAstNode.dig(Argument);
        return args;
    }
}

class ModeSwitcher extends BaseCommander {
    static get command() {
        return "mode";
    }
    static generateEvaluator(astNode) {
        return new Evaluator(astNode);
    }
    static LL = class extends this.superCls {
        static generateSecondaryParser(bnfAstNode) {
            bnfAstNode.assertBaseInstanceOf(ModeSwitcher);
            const args = bnfAstNode.baseType.getArguments(bnfAstNode);
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
                    return astManager.root.evaluator.value;
                };
            };
            return AstNode.parserWrapper(bnfAstNode, test, process);
        }
    };
}

class Commands extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            UserOr.getOrCreate(this.parserGenerator, 
                ModeSwitcher.getOrCreate(this.parserGenerator),
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
                MonoTerm.lastTermCls.getOrCreate(this.parserGenerator),
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
                UserOr.getOrCreate(this.parserGenerator, 
                    // 基本最長マッチだが，同長の場合Token優先なのでToken→MyNonTerminalの順
                    Token.getOrCreate(this.parserGenerator),
                    MyNonTerminal.getOrCreate(this.parserGenerator),
                    MyTerminals.getOrCreate(this.parserGenerator),
                    Reference.getOrCreate(this.parserGenerator),
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


class MyNonTerminal extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            CoreList.getOrCreate(this.parserGenerator, generator => Name.getOrCreate(generator), {separator: MyNonTerminal.selector, allowTrailing: false, allowEmpty: false})
        ];
    }
    static get selector() {
        return '.';
    }
    static nameHierarchy(bnfAstNode) {
        bnfAstNode.assertBaseInstanceOf(this);
        return bnfAstNode.dig(Name);
    }
    static generateEvaluator(astNode) {
        return new Evaluator(astNode);
    }
    static LL = class extends this.superCls {
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
    };
    static LR = class extends this.superCls {
        static generateSecondaryParser(bnfAstNode) {
            // １．構文定義側のモード遷移情報を字句定義に落とし込む
            // このとき，可能なら遷移先を把握し，不可能なら終了トークンが現れるまで単なる文字列とする
            const bnfAstManager = bnfAstNode.bnfAstManager;
            const root = bnfAstManager.root;
            const switchers = root.dig(ModeSwitcher).map(switcher => switcher.climb(Commands));
            // bnfAstManager.dump(bnfAstNode.root);
            // １．１．モードスイッチの直前の要素が定義されているか調べる
            const contextMap = new Map;
            const startToMode = new Map;
            const startStrSet = new Set;
            const endToMode = new Map;
            const endStrSet = new Set;
            for(const switcher of switchers) {
                const siblings = switcher.climb(Assign).dig(RightValue).find().leaves.filter(sibling => ClassCategory.isLRops.has(sibling.baseType));
                const midIndex = siblings.findIndex(sibling => sibling === switcher);
                if(midIndex === -1) {
                    throw "aaa";
                }
                const before = siblings.slice(0, midIndex).reverse();
                const after = siblings.slice(midIndex + 1);
                const prev = before.find(sibling => !sibling.isNullable);
                const next = after.find(sibling => !sibling.isNullable);
                if(prev === undefined) {
                    new BnfLayerError(
                        `${switcher.bnfStr} must be directly preceded by a terminal or non-terminal. No adjacent node found.`, 
                        SyntaxError);
                }
                if(prev.instance instanceof MyNonTerminal) {
                    new BnfLayerError(
                        `Nonterminal "${prev.bnfStr}" is specified immediately before a mode transition(${switcher.bnfStr}), but only terminal symbols (tokens) are allowed as transition triggers.\n` + 
                        `Please use a token directly to initiate a mode transition.\n` +
                        `Line: ${prev.pos.LINE}, Col: ${prev.pos.COLUMN}`, 
                        SyntaxError);
                }
                const modeName = BaseCommander.getArguments(switcher)[0].bnfStr;
                if(!contextMap.has(modeName)) {
                    contextMap.set(modeName, {
                        starts: new Set,
                        ends: new Set,
                    });
                }
                const context = contextMap.get(modeName);
                context.starts.add(prev);
                context.ends.add(next);
                startToMode.set(prev, switcher);
                startStrSet.add(prev.bnfStr);
                if(next) {
                    endToMode.set(next, switcher);
                    endStrSet.add(next.bnfStr);
                }
            }
            // １．２．前操作で調べたprevの他の用途を調べる
            const sameTokensAsStart = new Set(root.dig(Token).filter(token => startStrSet.has(token.bnfStr)));
            console.log(sameTokensAsStart.size, startToMode.size);
            throw "aa";
            // ２．前操作での情報をもとに文字列を分割する

            // ３．がんばる

            const test = (strObj, index) => {
                console.log(strObj.str);
                throw new Error;
            };
            const parse = (strObj) => {

            };
            return {
                test, parse
            };
        }
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
    static LL = class extends this.superCls {
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
    };
    static LR = class extends this.superCls {
        static generateSecondaryParser(bnfAstNode) {
            return Token.LL.generateSecondaryParser(bnfAstNode);
        }
    }
}

class Renamer extends UserCoreGroup {
    get define() {
        return [
            CoreTerminal.getOrCreate(this.parserGenerator, Renamer.mark), 
            CoreOption.getOrCreate(this.parserGenerator, VarName.getOrCreate(this.parserGenerator), CoreWhite.getOrCreate(this.parserGenerator), CoreTerminal.getOrCreate(this.parserGenerator, ':'), CoreWhite.getOrCreate(this.parserGenerator)),
            this.args[0].getOrCreate(this.parserGenerator)
        ];
    }
    static get mark() {
        return '$';
    }
    static get reference() {
        return 2;
    }
    static valids(bnfAstNode) {
        return [this.reference];
    }
    static getAnchor(bnfAstNode, {marked = false} = {}) {
        const anchor = (() => {
            const opt = bnfAstNode.children.find(t => t.baseType === CoreOption);
            if(opt.count) {
                return opt.digOne(VarName).bnfStr;
            }
            const token = bnfAstNode.children[bnfAstNode.baseType.reference].digOne(Token, {required: false, errorMes: "Alter name setting error.", errorType: SyntaxError});
            if(token) {
                return token.bnfStr;
            }
            const nonTerminal = bnfAstNode.children[bnfAstNode.baseType.reference].digOne(MyNonTerminal, {required: true, errorMes: "Alter name setting error.", errorType: SyntaxError});
            return MyNonTerminal.nameHierarchy(nonTerminal).map(t => t.bnfStr).join(MyNonTerminal.selector);
        })();
        return (marked ? this.mark : "") + anchor;
    }
    static getBody(bnfAstNode) {
        return this.valids(bnfAstNode).map(i => bnfAstNode.children[i])[0];
    }
    static LL = class extends this.superCls {
        static generateSecondaryParser(bnfAstNode) {
            const parser = super.LL.generateSecondaryParser(bnfAstNode);
            const anchor = Renamer.getAnchor(bnfAstNode);
            const newProcess = (astNode, strObj, result, seed) => {
                parser.process(astNode, strObj, result, seed);
                if(anchor !== null) {
                    astNode.setAnchor(anchor);
                }
            };
            return AstNode.parserWrapper(bnfAstNode, parser.test, newProcess);
        }
    };
}

class Reference extends UserCoreGroup {
    get define() {
        return [
            CoreTerminal.getOrCreate(this.parserGenerator, '$$'), 
            VarName.getOrCreate(this.parserGenerator),
        ];
    }
    static getPath(bnfAstNode) {
        const anchor = bnfAstNode.digOne(VarName).bnfStr;
        const renamer = bnfAstNode.leafView.filter(leaf => leaf.nodeTraits.isRenamer).find(renamer => Renamer.getAnchor(renamer) === anchor);
        if(renamer === undefined) {
            new BnfLayerError(
                `Undefined reference anchor ${anchor}.`, 
                SyntaxError);
        }

    }
    static getAnchor(bnfAstNode) {
        const anchor = bnfAstNode.digOne(VarName).bnfStr;
        return anchor;
    }
    static getRule(bnfAstNode) {
        const anchor = this.getAnchor(bnfAstNode);
        const renamer = bnfAstNode.leafView.filter(leaf => leaf.nodeTraits.isRenamer).find(renamer => Renamer.getAnchor(renamer) === anchor);
        if(renamer === undefined) {
            new BnfLayerError(
                `Undefined reference anchor ${anchor}.`, 
                SyntaxError);
        }
        return Renamer.getBody(renamer);
    }
    static Ready(astNode) {
        const bnfAstNode = astNode.instance;
        const anchor = this.getAnchor(bnfAstNode);
        const across = bnfAstNode.across({
            onlyTag: true, 
            followOr: false, 
            returnPath: true,
        }).find(info => {
            const tag = info.node;
            return tag.baseType.getAnchor(tag) === anchor;
        });
        const targetAst = astNode.getAstNodeTraceBnfPath(across.node, across.path);
        if(targetAst.str !== astNode.str) {
            const targetAnchor = targetAst.baseType.getAnchor(targetAst.instance, {marked: true});
            new SyntaxLayerError(
                `Tag mismatch: ${bnfAstNode.bnfStr} must match the value of ${targetAnchor}, but got "${astNode.str}" instead of "${targetAst.str}".`,
                Error);
        }
    }
    static LL = class extends this.superCls {
        static generateSecondaryParser(bnfAstNode) {
            bnfAstNode.assertBaseInstanceOf(Reference);
            const rule = Reference.getRule(bnfAstNode);
            const parser = rule.baseType.LL.generateSecondaryParser(rule);
            // const {process} = parser;
            const process = (astNode, strObj, result, seed) => {
                return parser.process(astNode, strObj, result, seed);
            };
            return AstNode.parserWrapper(bnfAstNode, parser.test, process);
        }
    };
}

class Variable extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [CoreTerminal.getOrCreate(this.parserGenerator, '$'), VarName.getOrCreate(this.parserGenerator)]
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
            Braces.getOrCreate(this.parserGenerator,
                CoreList.getOrCreate(this.parserGenerator, generator => DefaultValue.getOrCreate(generator)),
            ),
            CoreWhite.getOrCreate(this.parserGenerator), 
        ]
    }
    static getDefaults(bnfAstNode) {
        bnfAstNode.assertBaseInstanceOf(this);
        const list = bnfAstNode.digOne(CoreList);
        return list.dig(DefaultValue).map(node => DefaultValue.getDefault(node));
    }
}

class DefaultValue extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            CoreTerminal.getOrCreate(this.parserGenerator, '$'), 
            CoreOption.getOrCreate(this.parserGenerator, VarName.getOrCreate(this.parserGenerator), CoreWhite.getOrCreate(this.parserGenerator), CoreTerminal.getOrCreate(this.parserGenerator, ':'), CoreWhite.getOrCreate(this.parserGenerator)), 
            MyNonTerminal.getOrCreate(this.parserGenerator), CoreWhite.getOrCreate(this.parserGenerator), CoreTerminal.getOrCreate(this.parserGenerator, '('), CoreWhite.getOrCreate(this.parserGenerator), 
            CoreTerminal.getOrCreate(this.parserGenerator, '`'),
            CoreAsterisk.getOrCreate(this.parserGenerator, 
                CoreOr.getOrCreate(this.parserGenerator, 
                    CoreNegTerminalSet.getOrCreate(this.parserGenerator, '`\\'), 
                    CoreGroup.getOrCreate(this.parserGenerator, CoreTerminal.getOrCreate(this.parserGenerator, '\\'), CoreTerminalDot.getOrCreate(this.parserGenerator))
                )
            ),
            CoreTerminal.getOrCreate(this.parserGenerator, '`'), CoreWhite.getOrCreate(this.parserGenerator), 
            CoreWhite.getOrCreate(this.parserGenerator), CoreTerminal.getOrCreate(this.parserGenerator, ')'),
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
                MyRepeaterSet.getOrCreate(this.parserGenerator),
                UserCoreGroup.getOrCreate(this.parserGenerator, CoreTerminal.getOrCreate(this.parserGenerator, '!'), MyRepeaterSet.getOrCreate(this.parserGenerator))
            )
        ];
    }
    static generateEvaluator(astNode) {
        if(astNode.assertion) {
            return new Evaluator(astNode.match);
        }
        return super.generateEvaluator(astNode);
    }
    static LL = class extends this.superCls {
        static generateSecondaryParser(bnfAstNode) {
            const or = bnfAstNode.children[0];
            const child = or.children[0];
            const parser = (() => {
                if(child.baseType === MyRepeaterSet) {
                    return child.baseType.LL.generateSecondaryParser(bnfAstNode);
                }
                child.valids = [1];
                const parser = super.LL.generateSecondaryParser(bnfAstNode);
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
    };
}

class MyRepeaterSet extends UserCoreGroup {
    get define() {
        return [
            UserOr.getOrCreate(this.parserGenerator, 
                RightElement.getOrCreate(this.parserGenerator),
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
    static LL = class extends this.superCls {
        static generateSecondaryParser(bnfAstNode) {
            const bnfChild = bnfAstNode.children.find(t => t.baseType === bnfAstNode.instance.elemType);
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

    }
}

class MyAsterisk extends MyRepeater {
    get define() {
        return [
            this.elemType.getOrCreate(this.parserGenerator), CoreTerminal.getOrCreate(this.parserGenerator, '*')
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
            this.elemType.getOrCreate(this.parserGenerator), CoreTerminal.getOrCreate(this.parserGenerator, '+')
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
            this.elemType.getOrCreate(this.parserGenerator), CoreTerminal.getOrCreate(this.parserGenerator, '?')
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
            this.elemType.getOrCreate(this.parserGenerator), CoreTerminal.getOrCreate(this.parserGenerator, '{'), CoreWhite.getOrCreate(this.parserGenerator), CoreTerminalSet.getOrCreate(this.parserGenerator, '0123456789'), CoreWhite.getOrCreate(this.parserGenerator), CoreTerminal.getOrCreate(this.parserGenerator, ','), CoreWhite.getOrCreate(this.parserGenerator),CoreTerminalSet.getOrCreate(this.parserGenerator, '0123456789'),CoreWhite.getOrCreate(this.parserGenerator), CoreTerminal.getOrCreate(this.parserGenerator, '}')
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
            CoreList.getOrCreate(this.parserGenerator, generator => this.candidate.getOrCreate(generator), {separator: this.operator, allowTrailing: false, allowEmpty: false}),
        ];
    }
    static candidates(bnfAstNode, exclude = new Set) {
        const candidateType = bnfAstNode.instance.candidate;
        return bnfAstNode.dig(candidateType).filter(n => !exclude.has(n));
    }
    static LL = class extends this.superCls {
        static generateSecondaryParser(bnfAstNode, exclude = new Set) {
            bnfAstNode.assertBaseInstanceOf(BnfOr);
            const candidates = bnfAstNode.baseType.candidates(bnfAstNode, exclude);
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
                return bnfAstNode.baseType.LL.generateSecondaryParser(bnfAstNode, exclude);
            };
        }
    };
}

class MyOr extends BnfOr {
}

class MyTerminals extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            UserOr.getOrCreate(this.parserGenerator, 
                UserTerminal.getOrCreate(this.parserGenerator),
                NoCaseTerminal.getOrCreate(this.parserGenerator),
                MyNegTerminalSet.getOrCreate(this.parserGenerator),
                MyTerminalSet.getOrCreate(this.parserGenerator),
            )
        ];
    }
    typeName(bnfAstNode) {
        const child = bnfAstNode.children[0].children[0].instance;
        const dict = [
            [UserTerminal, "String"],
            [NoCaseTerminal, "Case insensitive string"],
            [MyTerminalSet, "Char set"],
            [MyNegTerminalSet, "Char negative set"],
        ];
        for(const cls of dict) {
            if(child.constructor === cls[0]) {
                return cls[1];
            }
        }
        return undefined;
    }
    syntaxLogText(bnfAstNode) {
        const replace = (str) => {
            if (str.trim() === "") {
              // 空白・制御文字だけで構成されている場合にのみ変換
              return str
                .replace(/ /g, "<SP>")
                .replace(/\t/g, "<TAB>")
                .replace(/\u00A0/g, "<NBSP>")
                .replace(/\u3000/g, "<IDEOSP>")
                .replace(/\u200B/g, "<ZWS>")
                .replace(/^$/g, "<empty>");
            } else {
              // 通常の文字列はそのまま返す
              return str;
            }
        };
        const child = bnfAstNode.children[0].children[0].instance;
        const bracket = child.bracket;
        const length = bnfAstNode.bnfStr.length - bracket[0].length - bracket[1].length;
        const start = bracket[0].length;
        return bracket[0] + replace(bnfAstNode.bnfStr.substring(start, start + length)) + bracket[1];
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
        const charSet = new Set(this.targetString(bnfAstNode).split(''));
        const start = index;
        const length = start < index ? 0 : 1; 
        const target = strObj.read(start, 1);
        if(target.length && charSet.has(target)) {
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

class MyNegTerminalSet extends UserTerminal {
    get bracket() {
        return ["'^", "'"];
    }
    static terminalTest(strObj, index, bnfAstNode, seed) {
        const charSet = new Set(this.targetString(bnfAstNode).split(''));
        const start = index;
        const length = start < index ? 0 : 1; 
        const target = strObj.read(start, 1);
        if(target.length && !charSet.has(target)) {
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
const LeafCategory = {
    // symbol
    token: new Set([Token]),
    literal: new Set([MyTerminals]),
    nonTerminal: new Set([MyNonTerminal]),
    // command
    command: new Set([Commands]),
    name: new Set([Name]),
};

const ClassCategory = {
    isUserLeaf: LeafCategory,
    isUserBranch: new Set([MyOr, BnfOr]),
    isRenamer: new Set([Renamer]),
    isTest: new Set([Reference]),
    isLRops: new Set([Token, MyNonTerminal, Commands]),
    isSymbol: new Set([Token, MyTerminals, MyNonTerminal]),
};

module.exports = {
    CoreEntryPoint,
    MyNonTerminal,
    Name,
    Assign,
    AssignRight,
    AssignLeft,
    RightValue,
    ClassCategory,
    ModeSwitcher,
    Renamer,
    Arguments,
};
