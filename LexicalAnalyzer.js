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
} = require('./LexicalAnalyzerBNF.js');

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
    #tokens = null;
    #tokenSet = null;
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
        // BnfAstManagerは依存関係の解析や名前解決をメインタスクとした管理クラス．
        this.#bnfAstManager = new BnfAstManager(ParserGenerator.Cls);
        this.#bnfAstManager.root = this.#entryPoint.primaryParser.parse(strObj).node;
        this.#declare();
        this.#assign();
        this.#tokens = this.allBnfRuleName;
        this.#tokenSet = new Set(this.#tokens);
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
    tokenTest(strObj, index) {
        const parsers = this.#tokens.map(token => this.getSyntaxParser(token));
        const results = parsers.map(parser => {
            const result = parser.test(strObj, index);
            result.parser = parser;
            return parser;
        }).filter(result => result.success);
        const max = results.reduce((acc, cur) => {
            if(acc.length < cur.length) {
                return cur;
            }
            return acc;
        }, results[0]);
        return max;
    }
    getToken(bnfAstNode, astNode, strObj, result, seed) {
        // const result = this.tokenTest(strObj, strObj.ptr);
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
    has(strObj, index) {
        const hits = this.#tokens.filter(token => strObj.read(index, token.length) === token);
        const max = hits.reduce((acc, cur) => {
            if(acc.length < cur.length) {
                return cur;
            }
            return acc;
        }, hits[0]);
        return max;
    }
}

class LexicalAnalyzer {
    #parserGenerator;
    set bnf(bnf) {
        this.#parserGenerator = new ParserGenerator;
        return this.#parserGenerator.analyze(bnf);
    }
    set tokens(val) {
        this.bnf = val;
    }
    testBnf(strObj, index) {
        if(!this.#parserGenerator) {
            return {
                success: false,
            };
        }
        const hit = this.#parserGenerator.has(strObj, index);
        if(hit === undefined) {
            return {
                success: false,
            };
        }
        return {
            success: true,
            length: hit.length
        };
    }
    ignoreTest(strObj, index, seed) {
        const whites = new Set(" \t\n".split(''));
        let length = 0;
        while(1) {
            const c = strObj.read(index + length, 1);
            if(!whites.has(c)) {
                break;
            }
            length++;
        }
        return {
            success: true,
            length
        };
    }
    test(bnfAstNode, strObj, index, seed) {
        const ignoreResult = this.ignoreTest(strObj, index, seed);
        if(ignoreResult.length) {
            if(bnfAstNode.bnfStr === "WHITE") {
                return ignoreResult;
            }
        }
        if(bnfAstNode.bnfStr === "PLUS") {
            // bnfAstNode.manager.dump(bnfAstNode.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent.parent);
        }
        const digits = new Set("0123456789".split(''));
        const first = strObj.read(index, 1);
        if(first === "0" || first === '+') {
            return {
                success: true,
                length: 1,
            }
        }
        if(!digits.has(first)) {
            return {
                success: false,
                length: undefined,
            }
        }
        let length = 1;
        while(1) {
            const c = strObj.read(index + length, 1);
            if(!digits.has(c)) {
                break;
            }
            length++;
        }
        return {
            success: true,
            length: length
        };
    }
    process (bnfAstNode, astNode, strObj, result, seed) {
        strObj.shift(result.length);
        astNode.length = result.length;
    };
}

module.exports = {
    LexicalAnalyzer
};