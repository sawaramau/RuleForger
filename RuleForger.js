"use strict"
/*
 * RuleForger - A parser generator for intuitive syntax and semantics
 * Copyright (c) 2025 k.izu
 * Licensed under the ISC License. See LICENSE file for details.
 */
const {
    StringObject,
    BaseAstNode,
    AstNode,
    AstManager,
    BnfAstNode,
    BnfAstManager,
    CoreAstNode,
} = require('./common.js');
const {
    CoreEntryPoint,
    MyNonTerminal,
    Name,
    Assign,
    AssignRight,
    AssignLeft,
    RightValue,
    LeafCategory,
} = require('./RuleForgerBNF.js');

const {
    NotImplementedError, 
    BaseLayerError, 
    CoreLayerError, 
    BnfLayerError, 
    AstLayerError, 
    RuntimeLayerError, 
    UncategorizedLayerError,
    LogLevel,
    withLogContext,
} = require('./Error.js');

class MyBnfAstManager extends BnfAstManager {
    #enableLRparse = false;
    #useLRparse = true;
    get ruleForger() {
        return this.parserGenerator.ruleForger;
    }
    get modeDeck() {
        return this.parserGenerator.modeDeck;
    }
    set useLR(val) {
        this.#useLRparse = val;
    }
    get useLR() {
        return this.#useLRparse && this.#enableLRparse;
    }
    _hookAfterAnalyze(rootBnfAstNode) {
        if(!this.#useLRparse) {
            return;
        }
        const tokenSet = LeafCategory.token;
        const nonTerminalSet = LeafCategory.nonTerminal;
        const terminalSet = LeafCategory.terminal;
        const tokenLeaves = new Set(rootBnfAstNode.leaves.filter(leaf => tokenSet.has(leaf.baseType)).map(leaf => leaf.bnfStr));
        const nonTerminalLeaves = new Set(rootBnfAstNode.leaves.filter(leaf => nonTerminalSet.has(leaf.baseType)).map(leaf => leaf.bnfStr));
        const duplicationLeaves = nonTerminalLeaves.intersection(tokenLeaves);
        const terminalLeaves = new Set(rootBnfAstNode.leaves.filter(leaf => terminalSet.has(leaf.baseType)));
        if(terminalLeaves.size || duplicationLeaves.size) {
            this.#enableLRparse = false;
            if(terminalLeaves.size) {
                const types = Array.from(new Set(Array.from(terminalLeaves).map(leaf => withLogContext(leaf.typeName))));
                new BnfLayerError(
                    `Cannot use LR parser ` +
                    `because using follow terminals 
                    ${types.map(type => {
                        const filterd = Array.from(terminalLeaves).filter(leaf => withLogContext(leaf.typeName) === type);
                        return "[" + type + "] : " + filterd.map(leaf => (withLogContext(leaf.syntaxLogText))).join(', ');
                    }).join("\n                    ")}`, 
                    SyntaxError, LogLevel.Info);
            }
            if(duplicationLeaves.size) {
                new BnfLayerError(
                    `Cannot use LR parser ` +
                    `because name conflicts with token adn non terminal: ${Array.from(duplicationLeaves).join(", ")}`, 
                    SyntaxError, LogLevel.Info);
            }
        } else {
            this.#enableLRparse = true;
        }
    }
}
// BnfAstManagerから構文解析器を作るための機能を抽出したクラス
class ParserGenerator {
    #entryPoint = CoreEntryPoint.getOrCreate(this);
    #bnfAstManager;
    #ruleForger = null;
    get lexicalAnalyzer() {
        return this.#entryPoint.lexicalAnalyzer;
    }
    set ruleForger(val) {
        return this.#ruleForger = val;
    }
    get ruleForger() {
        return this.#ruleForger;
    }
    get modeDeck() {
        return this.#ruleForger.modeDeck;
    }
    set token(val) {
        this.#entryPoint.token = val;
    }
    static get Cls() {
        const Cls = {};
        Cls.NonTerminal = MyNonTerminal;
        Cls.Name = Name;
        Cls.Assign = Assign;
        Cls.AssignRight = AssignRight;
        Cls.AssignLeft = AssignLeft;
        Cls.RightValue = RightValue;
        return Cls;
    }
    analyze(str) {
        const strObj = new StringObject(str);
        this.#bnfAstManager = new MyBnfAstManager(ParserGenerator.Cls);
        this.#bnfAstManager.parserGenerator = this;
        this.#bnfAstManager.root = this.#entryPoint.primaryParser.parse(strObj).node;
    }
    getSyntaxParser(entryPoint = 'expr') {
        const manager = this.#bnfAstManager;
        const lexicalAnalyzer = this.#entryPoint.lexicalAnalyzer;
        const ignores = Array.from(lexicalAnalyzer.ignoredTokens).join(" ");
        return manager.getParser(entryPoint, (systemSpace) => {
            const newEp = "ep";
            const rightStr = "$" + entryPoint + " " + ignores;
            manager.declareAndAssignFromLeftRightStr(newEp, rightStr, systemSpace);
            return newEp;
        }, true);
    }
    get bnfStr() {
        return this.#bnfAstManager.root.bnfStr;
    }
    dumpBnfAST() {
        this.#bnfAstManager.dump();
    }
    get allBnfRuleName() {
        return this.#bnfAstManager.getAllRuleName();
    }
}

class RuleForger {
    #modeDeck = null;
    #astManager = null;
    #name = undefined;
    #token = undefined;
    #parserGenerator;
    #program;
    #entryPoint = 'expr';
    #evaluators;
    #peeks;
    get debugLevel() {
        return 1;
    }
    set modeDeck(val) {
        return this.#modeDeck = val;
    }
    set name(val) {
        return this.#name = val;
    }
    get name() {
        return this.#name;
    }
    get modeDeck() {
        return this.#modeDeck;
    }
    setSyntax(bnf, token) {
        this.#token = token;
        this.bnf = bnf;
    }
    set bnf(bnf) {
        this.#parserGenerator = new ParserGenerator;
        this.#parserGenerator.ruleForger = this;
        if(this.#evaluators) {
            this.#parserGenerator.evaluators = this.#evaluators;
        }
        if(this.#token !== undefined) {
            this.#parserGenerator.token = this.#token;
        }
        this.#parserGenerator.analyze(bnf);
    }
    set token(val) {
        this.#token = val;
        if(this.#parserGenerator) {
            this.#parserGenerator.token = val;
        }
    }
    set evaluators(val) {
        const map = (() => {
            if(val instanceof Map) {
                return val;
            }
            if(val instanceof Array) {
                const map = new Map;
                for(const ev of val) {
                    map.set(ev.ruleName, ev.action);
                }
                return map;
            }
        })();
        this.#evaluators = map;
        return this.#evaluators;
    }
    get evaluators() {
        return this.#evaluators;
    }
    set peeks(val) {
        const map = (() => {
            if(val instanceof Map) {
                return val;
            }
            if(val instanceof Array) {
                const map = new Map;
                for(const ev of val) {
                    if(!ev.peeks) {
                        continue;
                    }
                    if(ev.peeks instanceof Map) {
                        map.set(ev.ruleName, ev.peeks);
                    } else {
                        const peeks = new Map;
                        for(const key of Object.keys(ev.peeks)) {
                            peeks.set(key, ev.peeks[key]);
                        }
                        map.set(ev.ruleName, peeks);
                    }
                }
                return map;
            }
        })();
        this.#peeks = map;
        return this.#peeks;
    }
    get peeks() {
        return this.#peeks;
    }
    set program(program) {
        return this.#program = program;
    }
    set entryPoint(entry) {
        return this.#entryPoint = entry;
    }
    get bnfStr() {
        return this.#parserGenerator.bnfStr;
    }
    execute(program = this.#program, entryPoint = this.#entryPoint) {
        const executer = this.parse(program, entryPoint).executer;
        return executer.value;
    }
    parser(entryPoint = this.#entryPoint) {
        {
            if(entryPoint === undefined) {
                throw new RuntimeLayerError("Undefined grammar rule.", Error);
            }
            if(!this.#parserGenerator) {
                throw new RuntimeLayerError("Parsing failed: no BNF grammar has been defined.", Error);
            }    
        }
        return this.#parserGenerator.getSyntaxParser(entryPoint)
    }
    parse(program = this.#program, entryPoint = this.#entryPoint) {
        if(program === undefined) {
            throw new RuntimeLayerError("No input provided for parsing.", Error);
        }
        const strObj = new StringObject(program);
        const parser = this.parser(entryPoint);
        const result = parser.test(strObj, strObj.ptr);
        if(!result.success) {
            throw new AstLayerError(`Cannot pass test for ${this.name} rule."`, SyntaxError);
        }
        this.#astManager = new AstManager;
        this.#astManager.evaluators = this.#evaluators || new Map;
        this.#astManager.peeks = this.#peeks || new Map;
        this.#astManager.root = parser.parse(strObj).node;
        return {
            executer: this.#astManager.root.evaluator,
            abstractSyntaxTree: this.#astManager.root,
        };
    }
    dumpProgramAST(program, entryPoint = this.#entryPoint) {
        if(program) {
            this.parse(program, entryPoint);
        }
        this.#astManager?.dump();
    }
    dumpBnfAST() {
        if(!this.#parserGenerator) {
            throw new RuntimeLayerError("Parsing failed: no BNF grammar has been defined.", Error);
        }
        this.#parserGenerator.dumpBnfAST();
    }
    dumpCacheResult() {
        console.log('     | Cache hit | No cache | Test count');
        console.log('--------------------------------------------');
        console.log('ALL  |', BaseAstNode.baseCacheHit, BaseAstNode.baseCacheNouse, BaseAstNode.baseTestCount);
        console.log('BNF  |', BnfAstNode.cacheHit, BnfAstNode.cacheNouse, BnfAstNode.testCount);
        console.log('AST  |', AstNode.cacheHit, AstNode.cacheNouse, AstNode.testCount);
        console.log('--------------------------------------------');
        console.log('Gen  |', CoreAstNode.genCount, CoreAstNode.sameDefineCount);
    }
    get allBnfRuleName() {
        return this.#parserGenerator.allBnfRuleName;
    }
}

class ModeDeck {
    #ruleForgers = new Map;
    addRuleForger(name, ruleForger) {
        ruleForger.modeDeck = this;
        ruleForger.name = name;
        this.#ruleForgers.set(name, ruleForger);
        return ruleForger;
    }
    get(name) {
        return this.#ruleForgers.get(name);
    }
}

module.exports = {
    RuleForger,
    ModeDeck,
};
