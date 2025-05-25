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
    RightValue
} = require('./LexicalAnalyzerBNF.js');

const {
    LogLevel,
    ErrorStrictLevel,
    GlobalErrorLevelManager,
    NotImplementedError, 
    BaseLayerError, 
    CoreLayerError, 
    LexLayerError,
    BnfLayerError, 
    AstLayerError, 
    RuntimeLayerError, 
    UncategorizedLayerError
} = require('./Error.js');

class MyBnfAstManager extends BnfAstManager {
    #flagMap = new Map;
    #evalMap = new Map;
    #excludeMap = new Map;
    #evaluators = {
        int: (str) => {
            return Number(str);
        },
        float: (str) => {
            return Number(str);
        }
    }
    get ErrorLayer() {
        return LexLayerError;
    }
    _hookAfterAnalyze(rootBnfAstNode) {
        // 名前空間を走査してフラグベースの集合を作る
        const assigns = rootBnfAstNode.dig(Assign);
        for(const assign of assigns) {
            const [left, right] = Assign.assign(assign);
            const ruleName = left.nameHierarchy.map(bnf => bnf.str).join(MyNonTerminal.selector);
            const rv = right.dig(RightValue, true, 1, 1)[0];
            const meta = RightValue.getMetas(rv);
            for(const flag of meta.flags) {
                if(!this.#flagMap.has(flag)) {
                    this.#flagMap.set(flag, new Set);
                }
                this.#flagMap.get(flag).add(ruleName);
            }
            for(const exclude of meta.excludes) {
                if(!this.#excludeMap.has(ruleName)) {
                    this.#excludeMap.set(ruleName, new Set);
                }
                this.#excludeMap.get(ruleName).add(exclude);
            }
            this.#evalMap.set(ruleName, meta.type);
        }
        // 各test関数を書き換える
    }
    setEvaluate(astNode, result) {
        const ruleName = astNode.instance.bnfStr;
        const evaluatorStr = this.#evalMap.get(ruleName);
        if(evaluatorStr !== undefined) {
            astNode.evaluate = ($, str) => {
                const newStr = str.slice(-result.ownLength);
                if(evaluatorStr in this.#evaluators) {
                    return this.#evaluators[evaluatorStr](newStr);9
                }
                throw new LexLayerError(
                    `Undefined semantic action '${evaluatorStr}' referenced in token definition '${astNode.instance.bnfStr}'.`  
                    , SyntaxError
                );
            };
        }
    }
    get ignoredTokens() {
        if(!this.#flagMap.has("skip")) {
            this.#flagMap.set("skip", new Set);
        }
        return new Set(this.#flagMap.get("skip"));
    }
    getExcludes(ruleName) {
        const result = new Set;
        if(!this.#excludeMap.has(ruleName)) {
            return result;
        }
        for(const exclude of this.#excludeMap.get(ruleName)) {
            if(exclude.type === "names") {
                for(const name of exclude.names) {
                    result.add(name);
                }
            } else if (exclude.type === "flagName") {
                const flag = exclude.flagName;
                const set = this.#flagMap.get(flag) || new Set;
                for(const name of set) {
                    result.add(name);
                }
            }
        }
        return result;
    }
}

// BnfAstManagerから構文解析器を作るための機能を抽出したクラス
class ParserGenerator {
    #entryPoint = CoreEntryPoint.getOrCreate(this);
    #bnfAstManager;
    #token = null;
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
        // BnfAstManagerは依存関係の解析や名前解決をメインタスクとした管理クラス．
        this.#bnfAstManager = new MyBnfAstManager(ParserGenerator.Cls);
        this.#bnfAstManager.parserGenerator = this;
        this.#bnfAstManager.root = this.#entryPoint.primaryParser.parse(strObj).node;
        this.#token = this.#bnfAstManager.getAllRuleName();
    }
    get token() {
        return new Set(this.#token);
    }
    getLexicalParser(entryPoint = 'expr') {
        return this.#bnfAstManager.getParser(entryPoint);
    }
    get bnfStr() {
        return this.#bnfAstManager.root.bnfStr;
    }
    dumpBnfAST() {
        this.#bnfAstManager.dump();
    }
    hasToken(strObj, index) {
        const hits = this.#token.filter(token => strObj.read(index, token.length) === token);
        const max = hits.reduce((acc, cur) => {
            if(acc.length < cur.length) {
                return cur;
            }
            return acc;
        }, hits[0]);
        return max;
    }
    setEvaluate(astNode, result) {
        return this.#bnfAstManager.setEvaluate(astNode, result);
    }
    get ignoredTokens() {
        return this.#bnfAstManager.ignoredTokens;
    }
    getExcludes(ruleName) {
        return this.#bnfAstManager.getExcludes(ruleName);
    }
}

class LexicalAnalyzer {
    #parserGenerator;
    set bnf(bnf) {
        this.#parserGenerator = new ParserGenerator;
        return this.#parserGenerator.analyze(bnf);
    }
    set token(val) {
        this.bnf = val;
    }
    testBnf(strObj, index) {
        if(!this.#parserGenerator) {
            return {
                success: false,
            };
        }
        const hit = this.#parserGenerator.hasToken(strObj, index);
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
    test(bnfAstNode, strObj, index, seed) {
        if(!this.#parserGenerator) {
            return {
                success: false,
            };
        }
        const ruleName = bnfAstNode.bnfStr;
        const ignores = this.ignoredTokens;
        ignores.delete(ruleName);
        let length = 0;
        for(const ignore of ignores) {
            const result = this.#parserGenerator.getLexicalParser(ignore).test(strObj, index + length);
            if(result.success && result.length) {
                length += result.length;
            }
        }
        // const parser = this.#parserGenerator.getLexicalParser(ruleName);
        // parser.test(strObj, index + length, seed);
        const result = this.#test(ruleName, strObj, index + length, seed);
        if(!result.success) {
            return {success: false};
        }
        result.ownLength = result.length;
        result.length += length;
        return result;
    }
    #test(ruleName, strObj, index, seed, visited = new Set) {
        if(visited.has(ruleName)) {
            throw new LexLayerError("", SyntaxError);
        }
        visited.add(ruleName);
        if(!this.#parserGenerator.token.has(ruleName)) {
            new LexLayerError(`Token '${ruleName}' is not defined.`, SyntaxError, LogLevel.Warn);
            return {success: false}
        }
        const excludes = this.#parserGenerator.getExcludes(ruleName);
        for(const exclude of excludes) {
            const result = this.#test(exclude, strObj, index, seed, new Set(visited));
            if(result.success) {
                return {success: false};
            }
        }
        const parser = this.#parserGenerator.getLexicalParser(ruleName);
        const result = parser.test(strObj, index, seed);
        return result;
    }
    process (bnfAstNode, astNode, strObj, result, seed) {
        strObj.shift(result.length);
        astNode.length = result.length;
        this.#parserGenerator.setEvaluate(astNode, result);
    }
    get ignoredTokens() {
        if(this.#parserGenerator) {
            return this.#parserGenerator.ignoredTokens;
        }
        return new Set;
    }
}

module.exports = {
    LexicalAnalyzer
};