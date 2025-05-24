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
    UserNonTerminal,
    Name,
    Assign,
    AssignRight,
    AssignLeft,
    RightValue
} = require('./RuleForgerBNF.js');

const {
    NotImplementedError, 
    BaseLayerError, 
    CoreLayerError, 
    BnfLayerError, 
    AstLayerError, 
    RuntimeLayerError, 
    UncategorizedLayerError
} = require('./Error.js');

// BNFから構文解析器を作ることがメインタスクのBNF管理クラス
class ParserGenerator {
    #entryPoint = CoreEntryPoint.getOrCreate(this);
    #bnfAstManager;
    #ruleForger = null;
    set ruleForger(val) {
        return this.#ruleForger = val;
    }
    get ruleForger() {
        return this.#ruleForger;
    }
    get modeDeck() {
        return this.#ruleForger.modeDeck;
    }
    set tokens(val) {
        this.#entryPoint.tokens = val;
    }
    static get Cls() {
        const Cls = {};
        Cls.NonTerminal = UserNonTerminal;
        Cls.Name = Name;
        Cls.Assign = Assign;
        Cls.AssignRight = AssignRight;
        Cls.AssignLeft = AssignLeft;
        Cls.RightValue = RightValue;
        return Cls;
    }
    analyze(str) {
        const strObj = new StringObject(str);
        this.#bnfAstManager = new BnfAstManager(ParserGenerator.Cls);
        this.#bnfAstManager.parserGenerator = this;
        this.#bnfAstManager.root = this.#entryPoint.primaryParser.parse(strObj).node;
        this.#declare();
        this.#assign();
    }
    #declare() {
        const stopper = bnfAstNode => {
            if(bnfAstNode.baseType === AssignLeft) {
                return bnfAstNode;
            }
            return false;
        };
        const process = bnfAstNode => {
            this.#bnfAstManager.declare(bnfAstNode);
        };
        this.#bnfAstManager.root.recursive(stopper, process, 1);
    }
    #assign() {
        const stopper = bnfAstNode => {
            if(bnfAstNode.baseType === Assign) {
                return bnfAstNode;
            }
            return false;
        };
        const process = bnfAstNode => {
            const [left, right] = Assign.assign(bnfAstNode);
            this.#bnfAstManager.assign(left, right);
        };
        this.#bnfAstManager.root.recursive(stopper, process, 1);
    }
    getSyntaxParser(entryPoint = 'expr') {
        return this.#bnfAstManager.getParser(entryPoint);
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
    #tokens = undefined;
    #parserGenerator;
    #program;
    #entryPoint = 'expr';
    #evaluators;
    #peeks;
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
    set bnf(bnf) {
        this.#parserGenerator = new ParserGenerator;
        this.#parserGenerator.ruleForger = this;
        if(this.#evaluators) {
            this.#parserGenerator.evaluators = this.#evaluators;
        }
        if(this.#tokens !== undefined) {
            this.#parserGenerator.tokens = this.#tokens;
        }
        this.#parserGenerator.analyze(bnf);
    }
    set tokens(val) {
        this.#tokens = val;
        if(this.#parserGenerator) {
            this.#parserGenerator.tokens = val;
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
