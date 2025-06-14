"use strict"
/*
 * RuleForger - A parser generator for intuitive syntax and semantics
 * Copyright (c) 2025 k.izu
 * Licensed under the ISC License. See LICENSE file for details.
 */

const {ExArray} = require('./Util.js');
const {
    NotImplementedError, 
    BaseLayerError, 
    CoreLayerError, 
    BnfLayerError, 
    AstLayerError, 
    RuntimeLayerError, 
    UncategorizedLayerError,
    logContextOnly,
    LogLevel,
} = require('./Error.js');

class StringObject {
    #ptr;
    #endptr;
    #str;
    constructor(str) {
        if(str instanceof StringObject) {
            this.str = str.str;
        } else {
            this.str = str;
        }
    }
    shift(len = 1) {
        const str = this.#str.substr(this.#ptr, len);
        this.#ptr += str.length;
        return str;
    }
    peek(len = 1) {
        return this.read(this.#ptr, len);
    }
    read(index = this.#ptr, len = this.length) {
        if(len >= 0) {
            return this.#str.substr(index, len);
        } else {
            // lenが負の数の時，手前側を読む
            const start = Math.max(index + len, 0);
            const newLeng = index - start;
            return this.#str.substr(start, newLeng);
        }
    }
    get str() {
        return this.#str.substring(this.#ptr, this.#endptr);
    }
    set str(str) {
        this.#str = str;
        this.#ptr = 0;
        this.#endptr = str.length;
    }
    get ptr() {
        return this.#ptr;
    }
    get length() {
        return this.#endptr - this.#ptr;
    }
    static get posStart(){
        return 0;
    }
    pos(index = this.#ptr) {
        const start = StringObject.posStart;
        let line = start;
        let column = start;
        for (let i = 0; i < index && i < this.#str.length; i++) {
            if (this.#str[i] === '\n') {
                line++;
                column = start;
            } else {
                column++;
            }
        }
        return { line, column };
    }
}

class SearchOrder {
    static get DFS() {
        return 1;
    }
    static get BFS() {
        return 0;
    }
}

class BaseAstNode {
    #string = undefined;
    #pos = undefined;
    #start = undefined;
    #instance;
    #strObj = null;
    #length = undefined;
    #parent = null;
    #children = [];
    #manager = null;
    #baseType = null;
    #anchor = null;
    static baseCacheHit = 0;
    static baseCacheNouse = 0;
    static baseTestCount = 0;
    static cacheHit = 0;
    static cacheNouse = 0;
    static testCount = 0;
    static storage = new Map;
    constructor(instance) {
        this.#instance = instance;
        this.#baseType = this.constructor.baseType(instance);
        if(!instance) {
            return;
        }
        for(const trait in instance.nodeTraits) {
            if(trait in this) {
                new CoreLayerError(
                    `Trait(${trait}) is already defined.`, 
                    Error);
            }
            Object.defineProperty(this, trait, {
                get: () => instance.nodeTraits[trait]
            })
        }
    }
    get ErrorLayer() {
        return BaseLayerError;
    }
    static isSuperClassOf(childCls) {
        let currentClass = childCls;
        while (1) {
            if(this === currentClass) {
                return true;
            }
            const base = Object.getPrototypeOf(currentClass);
            // Function（最上位）またはnullまで来たら終了
            if (!base || base === Function || base === Function.prototype) {
                break;
            }
            currentClass = base;
        }
        return false;
    }
    static isSubClassOf(parentCls) {
        if (typeof parentCls !== 'function') return false;

        let proto = this.prototype;
        while (proto) {
            if (proto === parentCls.prototype) return true;
            proto = Object.getPrototypeOf(proto);
        }
        return false;
    }
    static baseType(instance) {
        return instance.constructor;
    }
    get baseType() {
        return this.#baseType;
    }
    setAnchor(name) {
        return this.#anchor = name;
    }
    get anchor() {
        return this.#anchor;
    }
    get pos() {
        if(this.#pos === undefined) {
            const pos = this.#strObj.pos(this.start);
            this.#pos = {};
            this.#pos.column = pos?.column;
            this.#pos.line = pos?.line;
            this.#pos.COLUMN = pos?.column + 1;
            this.#pos.LINE = pos?.line + 1;
        }
        return this.#pos;
    }
    set strObj(val) {
        return this.#strObj = val;
    }
    get strObj() {
        return this.#strObj;
    }
    get length() {
        if(this.#length === undefined) {
            this.#length = this.children.filter(child => child.strObj === this.strObj).reduce((acc, child) => {
                return acc + child.length;
            }, 0);
        }
        return this.#length;
    }
    get start() {
        if(this.#start === undefined) {
            this.#start = (() => {
                if(!this.parent || (this.parent.strObj !== this.#strObj)) {
                    return 0;
                }
                let start = this.parent.start;
                for(const sibling of this.parent.children) {
                    if(sibling === this) {
                        return start;
                    }
                    start += sibling.length;
                }
                return start;
            })();
        }
        return this.#start;
    }
    set length(val) {
        return this.#length = val;
    }
    get str() {
        if(this.#string === undefined) {
            this.#string = this.#strObj.read(this.start, this.length);
        }
        return this.#string;
    }
    get instance() {
        return this.#instance;
    }
    set parent(val) {
        if((!this.#parent) || (this.canRewriteParent)) {
            this.#parent = val;
        }
        return this.#parent;
    }
    get parent() {
        return this.#parent;
    }
    static get upperAst() {
        throw new NotImplementedError;
    }
    get upperAst() {
        return new this.constructor.upperAst(this);
    }
    recursive(stopper, process, {strategy = SearchOrder.DFS, includeSelf = true} = {}, depth = 0) {
        const options = {strategy, includeSelf: true};
        if(strategy === SearchOrder.DFS) {
            // 深さ優先探索
            const stop = includeSelf ? stopper(this) : false;
            if(stop) {
                if(process) {
                    process(stop);
                }
            } else {
                for(const baseAstNode of this.children) {
                    baseAstNode.recursive(stopper, process, options, depth + 1);
                }
            }
        } else if(strategy === SearchOrder.BFS) {
            // 幅優先探索
            const queue = [this];
            while(queue.length) {
                const currentNode = queue.shift();
                const stop = stopper(currentNode);
                if(stop) {
                    if(process) {
                        process(stop);
                    }
                    continue;
                }
                for(const t of currentNode.children) {
                    queue.push(t);
                }
            }
        }
    }
    static CompareNodeType(left, right) {
        return left.constructor === right.constructor;
    }
    static IncrementCacheHit() {
        BaseAstNode.baseCacheHit++;
    }
    static IncrementCacheNouse() {
        BaseAstNode.baseCacheNouse++;
    }
    
    dig(cls, {strategy = SearchOrder.DFS, includeSelf = true, min = undefined, max = undefined, errorMes = undefined, errorType = undefined, logLevel = LogLevel.Error, first = false} = {}) {
        const array = [];
        function getType(value) {
            if (typeof value === 'function') {
                // 関数またはクラス（区別は↓で行う）
                const isClass = /^class\s/.test(Function.prototype.toString.call(value));
                return isClass ? 'class' : 'function';
            } else if (Array.isArray(value)) {
                return 'array';
            } else {
                return typeof value;
            }
        }
        const funcs = {
            class: node => {
                return node.baseType.isSubClassOf(cls);
            },
            array: node => {
                return cls.find(c => node.baseType.isSubClassOf(c))
            },
            function: node => {
                return cls(node);
            },
        };
        let found = false;
        const dummy = {};
        const func = funcs[getType(cls)];
        const stopper = baseAstNode => {
            if(first && found) {
                return dummy;
            }
            const result = func(baseAstNode) ? baseAstNode : false;
            if(result) {
                found = true;
            }
            return result;
        };
        const process = (baseAstNode) => {
            if(baseAstNode === dummy) {
                return;
            }
            array.push(baseAstNode)
        };
        this.recursive(stopper, process, {strategy, includeSelf});
        if(min !== undefined && max !== undefined) {
            if((array.length < min) || (array.length > max)) {
                if(errorMes !== undefined) {
                    new this.ErrorLayer(errorMes, errorType, logLevel);
                }
                new this.ErrorLayer(`Expected between ${min} and ${max} ${cls.name} in the leaf nodes, but found ${array.length}`, TypeError, logLevel);
            }
        } else if(min !== undefined) {
            if(array.length < min) {
                if(errorMes !== undefined) {
                    new this.ErrorLayer(errorMes, errorType, logLevel);
                }
                new this.ErrorLayer(`Expected at least ${min} ${cls.name} in the leaf nodes, but found ${array.length}`, TypeError, logLevel);
            }
        } else if(max !== undefined) {
            if(array.length > max) {
                if(errorMes !== undefined) {
                    new this.ErrorLayer(errorMes, errorType, logLevel);
                }
                new this.ErrorLayer(`Expected at most ${max} ${cls.name} in the leaf nodes, but found ${array.length}`, TypeError, logLevel);
            }
        }
        return array;
    }
    digOne(cls, {strategy = SearchOrder.DFS, required = false, includeSelf = true, errorMes = undefined, errorType = undefined, logLevel = LogLevel.Error} = {}) {
        const options = {strategy, max:1, includeSelf, errorMes, errorType, logLevel};
        if(required) {
            options.min = 1;
        } else {
            options.min = 0;
        }
        return this.dig(cls, options)[0];
    }
    digFirst(cls, {strategy = SearchOrder.DFS, required = false, includeSelf = true, errorMes = undefined, errorType = undefined, logLevel = LogLevel.Error} = {}) {
        const options = {strategy, max:1, includeSelf, errorMes, errorType, logLevel, first: true};
        if(required) {
            options.min = 1;
        } else {
            options.min = 0;
        }
        return this.dig(cls, options)[0];
    }
    climb(cls, {all = false, until = false, includeSelf = false, errorMes = undefined, errorType = undefined, logLevel = LogLevel.Error} = {}) {
        if(all && until) {
            new this.ErrorLayer(`climb(): options 'all' and 'until' cannot be used together.`, Error);
        }
        const options = {all, until, errorMes, errorType, logLevel, includeSelf: false};
        function getType(value) {
            if (typeof value === 'function') {
                // 関数またはクラス（区別は↓で行う）
                const isClass = /^class\s/.test(Function.prototype.toString.call(value));
                return isClass ? 'class' : 'function';
            } else if (Array.isArray(value)) {
                return 'array';
            } else {
                return typeof value;
            }
        }
        const funcs = {
            class: node => {
                return node.baseType.isSubClassOf(cls);
            },
            array: node => {
                return cls.find(c => node.baseType.isSubClassOf(c))
            },
            function: node => {
                return cls(node);
            },
        };
        const match = funcs[getType(cls)];
        if(includeSelf && match(this)) {
            if(all) {
                const results = this.climb(cls, options);
                results.push(this);
                return results;
            }
            if(until) {
                return [this];
            }
            return this;
        }
        if(this.parent) {
            if(match(this.parent)) {
                if(all) {
                    const results = this.parent.climb(cls, options);
                    results.push(this.parent);
                    return results;
                } else if(until) {
                    return [this.parent];
                }
                return this.parent;
            } else {
                const result = this.parent.climb(cls, options);
                if(until && result) {
                    result.push(this.parent);
                }
                return result;
            }
        }
        // Reach root, but not found.
        if(all) {
            return [];
        }
        return null;
    }
    assertBaseInstanceOf(cls) {
        if(!this.baseType.isSubClassOf(cls)) {
            throw new this.ErrorLayer(
                `${this.constructor.name}: Basetype mismatch: expected ${cls.name} but received ${this.baseType.name}`, 
                TypeError);
        }
        return true;
    }
    static get enableCacheSystem() {
        return true;
    }
    static get debugModeCacheSystem() {
        return false;
    }
    static cacheLineAvailable(baseAstNode, strObj, index, seed) {
        if(!this.enableCacheSystem && !this.debugModeCacheSystem) {
            return false;
        }
        if(seed) {
            return false;
        }
        const cache = this.getCache(baseAstNode, strObj, seed);
        if(!cache.has(index)) {
            return false;
        }
        const hist = cache.get(index);
        if(!hist.result || hist.inProgress) {
            return false;
        }
        return true;
    }
    static getCache(baseAstNode, strObj, seed) {
        if(!this.storage.has(baseAstNode)) {
            const memory = new Map;
            this.storage.set(baseAstNode, memory);
        }
        const memory = this.storage.get(baseAstNode);
        if(!memory.has(strObj)) {
            const cache = new Map;
            memory.set(strObj, cache);
        }
        const cache = memory.get(strObj);
        return cache;
    }
    static cacheLineCompare(cacheLine, result) {
        const orgResult = cacheLine.result;
        const newResult = result;
        const requireMatchKeys = ['success', 'length'];
        for(const key of requireMatchKeys) {
            if(orgResult[key] !== newResult[key]) {
                return false;
            }
        }
        return true;
    }
    static parserWrapper(baseAstNode, test, newTokenProcess, failerProcess) {
        const ret = {
            process: newTokenProcess,
            failer: failerProcess,
        };
        ret.test = (strObj, index, seed) => {
            BaseAstNode.baseTestCount++;
            this.testCount++;
            const cache = this.getCache(baseAstNode, strObj, seed);
            if(this.enableCacheSystem) {
                if(this.cacheLineAvailable(baseAstNode, strObj, index, seed)) {
                    this.IncrementCacheHit();
                    return cache.get(index).result;
                }
                this.IncrementCacheNouse();
            }
            const result = test(strObj, index, seed);
            if(this.enableCacheSystem || this.debugModeCacheSystem) {
                const cacheLine = (() => {
                    if(!cache.get(index)) {
                        return {};
                    }
                    const cacheLine = cache.get(index);
                    if(this.cacheLineAvailable(baseAstNode, strObj, index, seed)) {
                        if(!this.cacheLineCompare(cacheLine, result)) {
                            throw new baseAstNode.ErrorLayer(
`[CacheIntegrityError] test output does not match cached result.
    This suggests a possible bug in:
      - the result serialization logic,
      - the cache storage backend, or
      - the result comparison method itself.
    
    Aborting cache use to prevent propagation of inconsistent state.`, 
    Error);
                        }
                    }
                    return cacheLine;
                })();
                if(this.cacheLineAvailable(baseAstNode, strObj, index, seed)) {
                    this.IncrementCacheHit();
                } else if (!this.enableCacheSystem) {
                    this.IncrementCacheNouse();
                }
                if(!seed) {
                    cacheLine.result = result;
                    cache.set(index, cacheLine);
                }
            }
            return result;
        };
        ret.parse = (strObj, seed) => {
            if(baseAstNode.isRecursive && seed) {
                const upperAst = baseAstNode.upperAst;
                // このダミーノードを事前計算済みの子要素と後でswapする．
                upperAst.addChild(this.newDummyNode);
                upperAst.strObj = strObj;
                return {
                    node: upperAst,
                };
            }
            const result = ret.test(strObj, strObj.ptr, seed);
            if(!result.success) {
                if(failerProcess) {
                    failerProcess(strObj, result, seed);
                }
                return null;
            }
            const upperAst = baseAstNode.upperAst;
            upperAst.strObj = strObj;
            if(newTokenProcess) {
                newTokenProcess(upperAst, strObj, result, seed);
            }
            return {
                node: upperAst,
                length: result.length
            };
        };
        return ret;
    }
    get canRewriteParent() {
        return true;
    }
    addChild(baseAstNode) {
        if(!this.constructor.CompareNodeType(this, baseAstNode)) {
            throw new this.ErrorLayer(`Incompatible instance types: parent is ${this.constructor.name}, child is ${baseAstNode.constructor.name}.`, TypeError);
        }
        baseAstNode.parent = this;
        this.#children.push(baseAstNode);
    }
    get children() {
        return this.#children;
    }
    get manager() {
        if(this.parent) {
            return this.parent.manager;
        }
        return this.#manager;
    }
    setManager(val) {
        return this.#manager = val;
    }
    getParentPath(parent = null) {
        if(this.parent === parent) {
            return [this.parent];
        } else if (!this.parent) {
            return undefined;
        }
        const result = this.parent.getParentPath(parent);
        if(result) {
            result.push(this.parent);
        }
        return result;
    }
    assertUniqueTokens() {
        const map = this.#assertUniqueTokensBody();
        const violations = new Set;
        for(const [key, set] of map.entries()) {
            if(set.size > 1) {
                violations.add({key, set});
            }
        }
        if(violations.size > 0) {
            throw new this.ErrorLayer("Tree structure contains non-unique tokens.", SyntaxError);
        }
    }
    #depth;
    // map: あるノードが何の子としてどの深さで呼び出されたかを覚えておく変数
    // manageMap: あるノードが何の子として呼び出されたかを覚えておく変数
    #assertUniqueTokensBody(map = new Map, depth = 0, parent = null, manageMap = new Map) {
        this.#depth = depth;
        const set = map.get(this) || new Set;
        const manageSet = manageMap.get(this) || new Set;
        if(!manageSet.has(parent)) {
            manageSet.add(parent);
            set.add({parent, depth});
        }
        map.set(this, set);
        manageMap.set(this, manageSet);
        for(const child of this.children) {
            child.#assertUniqueTokensBody(map, depth + 1, this, manageMap);
        }
        return map;
    }
    swap(newNode) {
        if(!this.constructor.CompareNodeType(this, newNode)) {
            throw new this.ErrorLayer(`Incompatible instance types: parent is ${this.constructor.name}, child is ${newNode.constructor.name}.`, TypeError);
        }
        const index = this.parent.#children.findIndex(node => node === this);
        if(index === -1) {
            throw new this.ErrorLayer("Cannot find this node in this parent children.", Error);
        }
        const parentBk = this.#parent;
        this.parent.#children[index] = newNode;
        this.#parent = newNode.#parent;
        newNode.#parent = parentBk;
    }
    get leafView() {
        return this.across({followOr: false, onlySymbol: false});
    }
    get leaves() {
        if(this.isUserBranch) {
            const candidates = this.baseType.candidates(this).map(branch => branch.leaves);
            // 候補が1つしかないなら囲まない
            if(candidates.length === 1) {
                return candidates[0];
            }
            return [candidates];
        }
        if(this.isUserLeaf) {
            return [this];
        }
        const result = [];
        for(const child of this.children) {
            for(const leaf of child.leaves) {
                result.push(leaf);
            }
        }
        return result;
    }
    get nodeTraits() {
        return this.#instance.nodeTraits;
    }
}

class AbstractManager {
    #root;
    static dump(roots,  option = {}, prefix = "", isLast = true) {
        const arrow = option.arrow || ' -> ';
        const omitLength = option.omitLength || 8;
        const shortBefore = option.shortBefore || 3;
        const shortAfter = option.shortAfter || 3;
        const excluder = option.excluder || (node => false);
        const connector = isLast ? "└── " : "├── ";
        const end = roots.slice(-1)[0];
        const fullLabels = roots.map(root => root.label);
        const labels = fullLabels.filter((l, i) => l !== fullLabels[i - 1]);
        const skips = fullLabels.map((l, i) => [l, i]).filter((li => li[0] !== fullLabels[li[1] - 1])).map(li => li[1]);
        const label = '[' + end.name + '] ' + (() => {
            if(labels.length > omitLength) {
                return labels.slice(0, shortBefore).concat(['...']).concat(labels.slice(-shortAfter)).join(arrow) 
                       + ' (depth:' + labels.length + ')';
            }
            return labels.join(arrow);
        })();
        console.log(prefix + connector + label);
        const children = (end.children || []).filter(child => !excluder(child));
        const newPrefix = prefix + (isLast ? "    " : "│   ");
        for(const [index, child] of children.entries()) {
            // children.lengthが1な限り，インデント深さを抑えるために横方向に展開する．
            const singleChildChain = this.SingleChildChain(child, excluder);
            const isLastChild = index === children.length - 1;
            this.dump(singleChildChain, option, newPrefix, isLastChild);
        }
    }
    static SingleChildChain(node, excluder = (node) => false) {
        const chain = [node];
        let currentNode = node;
        while(1) {
            const children = currentNode.children.filter(child => !excluder(child));
            if(children.length !== 1) {
                break;
            }
            chain.push(children[0]);
            currentNode = children[0];
        }
        return chain;
    }

    get root() {
        return this.#root;
    }
    set root(baseAstNode) {
        baseAstNode.setManager(this);
        baseAstNode.assertUniqueTokens();
        return this.#root = baseAstNode;
    }
    dump(root = this.#root, option = {}) {
        const chain = AbstractManager.SingleChildChain(root);
        this.constructor.dump(chain, option);
    }
    get leaves() {
        return this.root.leaves;
    }
}

class SelectLogic {
    // 最長マッチ，ただし同長の場合に先優先
    static get max() {
        return 0;
    }
    // ファーストマッチ
    static get first() {
        return 1;
    }
}

class LeftRecursiveApproach {
    static get toLoop() {
        return 0;
    }
    static get toRightRecursionAndAstRebuild() {
        return 1;
    }
}
const globalSelectLogic = SelectLogic.max;
const globalLeftRecursiveApproach = LeftRecursiveApproach.toLoop;

class Evaluator {
    #src;
    #anchor = null;
    #type;
    constructor(src) {
        // src must be AstNode, evaluators Array or true/false.
        Evaluator.#ensureSrcType(src, this);
        this.#src = src;
    }
    static #ensureSrcType(src, ev) {
        if(src instanceof AstNode) {
            ev.#type = "AstNode";
            return;
        } else if(src instanceof Array) {
            for(const e of src) {
                if(!(e instanceof Evaluator)) {
                    throw new UncategorizedLayerError("Evaluator source must be ast node or Evaluator array.", TypeError);
                }
            }
            ev.#type = "Array";
            return;
        } else if (src === true || src === false) {
            ev.#type = "Boolean";
            return;
        }
        throw new UncategorizedLayerError("Evaluator source must be ast node or Evaluator array.", TypeError);
    }
    get anchor() {
        return this.#anchor;
    }
    get type() {
        return this.#type;
    }
    get src() {
        return this.#src;
    }
    get nameHierarchy() {
        return this.#src.nameHierarchy;
    }
    get value() {
        if(this.#src === true || this.#src === false) {
            return this.#src;
        }
        if(this.#src instanceof AstNode) {
            const args = this.#actionArgs;
            const evaluate = this.#src.evaluate;
            if(evaluate) {
                return evaluate(args, this.str);
            } else if(args instanceof Object) {
                // evaluatorsに見つからない場合でも，keyが1つならばそれを直接実行（.value）する．
                // （多層構造における自明な意味定義層の省略）
                const keys = Object.keys(args);
                if(keys.length === 1) {
                    return args[keys[0]].value;
                }
                // 親要素側でルールが定義されていればそれを参照する
                const inheritedEvaluate = this.#src.inheritedEvaluate;
                if(inheritedEvaluate) {
                    return inheritedEvaluate(args, this.str);
                }
                throw new BnfLayerError(`Not implemented for [${this.nameHierarchy}] action.`, NotImplementedError);
            }
            return this.str;
        } else {
            const obj = new ExArray;
            for(const [i, e] of this.array.entries()) {
                // イテレータでアクセス可能
                obj[i] = e;
            }
            for(const e of this.array) {
                const anchor = e.anchor;
                if(anchor !== null) {
                    // 直下の要素であれば名称でもアクセス可能(iteratorには含まれない)
                    obj[anchor] = e;
                }
            }
            return obj;
        }
    }
    get array() {
        if(!(this.#src instanceof Array)) {
            throw new UncategorizedLayerError('This evaluator source is not array.', SyntaxError);
        }
        return this.#src.map(e => e);
    }
    get str() {
        if(this.#src === true || this.#src === false) {
            return "";
        }
        if(this.#src instanceof AstNode) {
            return this.#src.str;
        }
        return this.#src.reduce((acc, cur) => acc += cur.str, "");
    }
    static createRestrictedProxy(obj, allowList = new Set, {readOnly = true} = {}) {
        if(allowList instanceof Array) {
            allowList = new Set(allowList);
        }
        const proxy = new Proxy(obj, {
            get(target, prop, reciever) {
                if(allowList.has(prop)) {
                    return Reflect.get(target, prop, reciever);
                }
                if(prop in target) {
                    new AstLayerError(
                        `Property '${String(prop)}' can not access via this instance.\n` +
                        `  Accessable properties: [${Array.from(allowList).join(', ')}]`, 
                         SyntaxError);
                }
                new AstLayerError(
                    `Property '${String(prop)}' is not defined.\n` +
                    `  Accessable properties: [${Array.from(allowList).join(', ')}]`, 
                    SyntaxError);
            },
            set(target, prop, value, reciever) {
                if(readOnly) {
                    new AstLayerError(`Cannot set this instance.`);
                }
                allowList.add(prop);
                return Reflect.set(target, prop, value, reciever);
            },
            has(target, prop) {
                return allowList.has(prop);
            }
        });
        return proxy;
    }
    get #actionArgs() {
        if(!(this.#src instanceof AstNode)) {
            return undefined;
        }
        const astNode = this.#src;
        const args = (() => {
            const $args = {};
            let bnf = undefined;
            const record = (t) => {
                const anchor = t.anchor;
                const val = t.evaluator;
                if(val) {
                    val.#anchor = anchor;
                }
                if(t.includedIteration) {
                    if($args[anchor] === undefined) {
                        $args[anchor] = new Evaluator([]);
                        bnf = t.instance;
                    }
                    if(bnf !== t.instance) {
                        throw new UncategorizedLayerError(`Already assigned ${anchor}`, SyntaxError);
                    }
                    $args[anchor].#src.push(val);
                } else {
                    if($args[anchor] === undefined) {
                        $args[anchor] = val;
                    } else {
                        throw new UncategorizedLayerError(`Already assigned ${anchor}`, SyntaxError);
                    }
                }
            };
            astNode.recursive(
                node => {
                    if(node.anchor !== null) {
                        record(node);
                    }
                    if(node.depth - astNode.depth > 1) {
                        return true;
                    }
                    return false;
                },
                undefined,
                {includeSelf: false}
            );
            return $args;
        })();
        return Evaluator.createRestrictedProxy(args, Object.keys(args));
    }
    get pos() {
        if(this.#src instanceof AstNode) {
            return this.#src.pos;
        }
        if(this.#src instanceof Array) {
            return this.#src[0].pos;
        }
    }
    peek(caller, instance) {
        if(this.#src === true || this.#src === false) {
            return this.#src;
        }
        if(this.#src instanceof AstNode) {
            const args = this.#actionArgs;
            if(this.#src.astManager.peeks.has(this.nameHierarchy)) {
                const actions = this.#src.astManager.peeks.get(this.#src.nameHierarchy);
                if(actions.has(caller)) {
                    actions.get(caller)(args, this.str, instance);
                    return;
                }
            }
            if(args instanceof Object) {
                // evaluatorsに見つからない場合，子要素に再帰的に放送する．
                const keys = Object.keys(args);
                for(const key of keys) {
                    args[key].peek(caller, instance);
                }
                return;
            }
            return this.str;
        } else {
            const obj = new ExArray;
            for(const [i, e] of this.array.entries()) {
                // イテレータでアクセス可能
                obj[i] = e;
            }
            for(const e of this.array) {
                const anchor = e.anchor;
                if(anchor !== null) {
                    // 直下の要素であれば名称でもアクセス可能(iteratorには含まれない)
                    obj[anchor] = e;
                }
            }
            return obj;
        }
    }
}

class AstNode extends BaseAstNode {
    #nameHierarchy = undefined;
    #nameHierarchyRaw = null;
    #evaluator = null;
    #isBoundary = false;
    #evaluate = undefined;
    static get newDummyNode() {
        return new this(BnfAstNode.newDummyNode);
    }
    static baseType(instance) {
        // instance.constructorは必ずBnfAstNodeでなにも分からないので，
        // BnfAstNodeのbaseTypeを見る
        return instance.baseType;
    }
    get ErrorLayer() {
        return AstLayerError;
    }
    get evaluator() {
        if(this.#evaluator === null) {
            this.#evaluator = this.instance.baseType.generateEvaluator(this);
        }
        return this.#evaluator;
    }
    get isBoundary() {
        return this.#isBoundary;
    }
    set isBoundary(val) {
        return this.#isBoundary = val;
    }
    get depth() {
        if(this.parent) {
            return this.parent.depth + (this.isBoundary ? 1 : 0);
        }
        return 0;
    }
    get includedIteration() {
        if(this.instance.instance.isMyRepeater) {
            return true;
        }
        if(this.parent) {
            return this.parent.includedIteration;
        }
        return false;
    }
    set nameHierarchy(nameHierarchy) {
        this.#nameHierarchyRaw = nameHierarchy;
        this.#nameHierarchy = this.#nameHierarchyRaw.hierarchy.join(this.#nameHierarchyRaw.selector);
    }
    get nameHierarchy() {
        return this.#nameHierarchy;
    }
    get label() {
        const label = this.instance.str;
        if(this.anchor) {
            return `{{${label}}}`;
        }
        return label;
    }
    get name() {
        return this.str;
    }
    get astManager() {
        return this.manager;
    }
    
    static IncrementCacheHit() {
        this.cacheHit++;
        super.IncrementCacheHit();
    }
    static IncrementCacheNouse() {
        this.cacheNouse++;
        super.IncrementCacheNouse();
    }
    get parentEvaluate() {

    }
    get evaluate() {
        if(!this.#evaluate && this.astManager.evaluators.has(this.nameHierarchy)) {
            this.#evaluate = this.astManager.evaluators.get(this.nameHierarchy);
        }
        return this.#evaluate;
    }
    set evaluate(val) {
        return this.#evaluate = val;
    }
    get inheritedEvaluate() {
        const selector = this.#nameHierarchyRaw.selector;
        for(let i = 1; i < this.#nameHierarchyRaw.hierarchy.length; i++) {
            const nameHierarchy = this.#nameHierarchyRaw.hierarchy.slice(0, -i).join(selector);
            if(this.astManager.evaluators.has(nameHierarchy)) {
                return this.astManager.evaluators.get(nameHierarchy);
            }
        }
        return undefined;
    }
    get Ready() {
        if(this.baseType.Ready) {
            return (...args) => {
                return this.baseType.Ready(...args);
            }
        }
    }
    getAstNodeTraceBnfPath(goalBnfAstNode, pathBnfAstNodes) {
        const climb = (node, path) => {
            const parent = node.climb(n => n.isUserBranch);
            if(parent.instance === path[0]) {
                return climb(parent, path.slice(1));
            }
            return {node, path};
        };
        const dig = (node, path) => {
            if(path.length) {
                const child = node.children.find(child => child.instance === path[0]);
                return dig(child, path.slice(1));
            }
            return node;
        };
        const {node, path} = climb(this, pathBnfAstNodes);
        const parent = dig(node, path);
        return parent.digFirst(child => child.instance === goalBnfAstNode, {strategy: SearchOrder.BFS});
    }
}

class AstManager extends AbstractManager {
    #evaluators;
    #peeks;
    set evaluators(val) {
        return this.#evaluators = val;
    }
    get evaluators() {
        return this.#evaluators;
    }
    set peeks(val) {
        return this.#peeks = val;
    }
    get peeks() {
        return this.#peeks;
    }
    get root() {
        return super.root;
    }
    set root(val) {
        const root = super.root = val;
        root.recursive(astNode => {
            if(astNode.Ready){
                astNode.Ready(astNode);
            };
        })
        return root;
    }
}

class BnfAstNode extends BaseAstNode {
    #isRecursive = false;
    #isToken = false;
    constructor(instance) {
        super(instance);
    }
    static get newDummyNode() {
        return new this(DummyOperand.newDummyNode);
    }
    get ErrorLayer() {
        return BnfLayerError;
    }
    getAnchorName() {
        return this.baseType.getAnchor(this);
    }
    get bnfStr() {
        return this.str;
    }
    static get upperAst() {
        return AstNode;
    }
    get parseType() {
        return this.bnfAstManager.parserType;
    }
    get parserCls() {
        return this.baseType[this.parseType];
    }
    get generateSecondaryParser() {
        return this.parserCls.generateSecondaryParser(this);
    }
    get generateSecondaryParserWithout() {
        if(this.parserCls.generateSecondaryParserWithout) {
            return this.parserCls.generateSecondaryParserWithout(this);
        }
        throw new CoreLayerError("Not implemented generateSecoundaryParserWithout", NotImplementedError);
    }
    get bnfAstManager() {
        return this.manager;
    }
    get name() {
        return this.str.replace(/\n/g, ' ');
    }
    get label() {
        return this.baseType.name;
    }
    static blank = new StringObject("");
    #isNullable = undefined;
    get isNullable() {
        if(this.#isNullable === undefined) {
            try {
                const parser = this.generateSecondaryParser;
                const result = parser.test(BnfAstNode.blank, 0);
                this.#isNullable = result.success;    
            } catch(err) {
                // 左再帰はこの時点でスタックオーバーフローになるが，notNullableとして扱う．
                // （LLパーサでは原理的に左再帰のnullableを扱うことができないはず）
                if(err instanceof RangeError) {
                    return this.#isNullable = false;
                }
                throw err;
            }
        }
        return this.#isNullable;
    }

    set isRecursive(val) {
        return this.#isRecursive = val;
    }
    get isRecursive() {
        return this.#isRecursive;
    }
    static IncrementCacheHit() {
        BnfAstNode.cacheHit++;
        super.IncrementCacheHit();
    }
    static IncrementCacheNouse() {
        BnfAstNode.cacheNouse++;
        super.IncrementCacheNouse();
    }
    get nameHierarchy() {
        return this.baseType.nameHierarchy(this);
    }
    get argNames() {
        return this.baseType.argNames(this);
    }
    get isToken() {
        return this.#isToken;
    }
    set isToken(val) {
        return this.#isToken = val;
    }
    get typeName() {
        return () => {
            return logContextOnly(() => {
                return this.instance.typeName(this);
            });
    
        };
    }
    get syntaxLogText() {
        return () => {
            return logContextOnly(() => {
                return this.instance.syntaxLogText(this);
            });
    
        };
    }
    across({
        followOr = false,
        hasTarget = false,
        isTarget = node => false,
        returnPath = false,
        firstOnly = true,
        onlySymbol = true,
        onlyTag = false,
        includeSelf = true,
        acrossLeft = true,
        acrossRight = true,
        depthLimit = Infinity,
    }) {
        if(onlyTag) {
            onlySymbol = false;
        }
        // 今の要素からルートまでの分岐要素をすべて洗い出す
        const toRootPath = this.climb(node => node.isUserBranch, {all: true});
        const toRootPathSet = new Set(toRootPath);
        let alreadyFoundByDFS = false;
        const hitCache = new Map();
        const isLeaf = node => {
            if(hitCache.has(node)) {
                return hitCache.get(node);
            }
            const result = (() => {
                if((firstOnly && alreadyFoundByDFS)) {
                    return false;
                }
                const hit = (() => {
                    if(onlySymbol) {
                        return node.isSymbol;
                    } else if (onlyTag) {
                        return node.isRenamer;
                    }
                    return node.isUserLeaf || node.isRenamer;
                })();
                if(!hasTarget || !hit) {
                    return hit;
                }
                const target = isTarget(node);
                if(target) {
                    alreadyFoundByDFS = true;
                }
                return target;
            })();
            hitCache.set(node, result);
            return result;
        };
        const getCandidates = branch => {
            const candidates = branch.baseType.candidates(branch);
            if(followOr) {
                return candidates;
            }
            if(candidates.length === 1) {
                return candidates;
            }
            const newCandidates = candidates.filter(candidate => {
                const branches = new Set(candidate.dig(child => child.isUserBranch));
                const newSet = toRootPathSet.intersection(branches);
                return newSet.size;
            });
            return newCandidates;
        };
        const isBranch = node => {
            const isBranch = node.isUserBranch;
            return isBranch;
        };
        const branchMap = new Map;
        const candidateMap = new Map;
        const root = toRootPath[0];
        const route = toRootPath.slice(1);
        route.push(this);
        const digBranch = (branch, depth = 0) => {
            const candidates = getCandidates(branch);
            let pattern = 0;
            for(const candidate of candidates) {
                // isBranchをスルーしたbranchを選定する方法を考える．
                const branchChildren = candidate.dig(node => isBranch(node) || isLeaf(node), {includeSelf: false});
                let localPattern = 1;
                const radixes = [];
                for(const child of branchChildren) {
                    if(isBranch(child)) {
                        const pattern = digBranch(child, depth + 1);
                        localPattern = localPattern * pattern;
                        radixes.push(child);
                    }
                }
                pattern += localPattern;
                candidateMap.set(candidate, {prod: localPattern, radixes});
            }
            branchMap.set(branch, pattern);
            // パターンの積計算のため，空集合であってもパターン数1として扱う
            return pattern || 1;
        };
        const pattern = digBranch(root);
        const paths = [];
        for(let i = 0; i < pattern; i++) {
            paths.push([]);
        }
        const getMixedRadixPositions = (start, end, total, candidate, radixesAsRaw) => {
            const digit = radixesAsRaw.findIndex(branch => branch === candidate);
            const radixes = radixesAsRaw.map(branch => branchMap.get(branch));
            const blockSize = radixes.slice(0, digit).reduce((acc, cur) => acc * cur, 1);
            // blockSizeを0-digitで見る理由（digit+1〜で見ない理由）をまとめたいけどうまく説明できない
            const positions = [];
            for(let j = 0; j < total; j++) {
                const calc = (Math.floor(j / blockSize) % radixes[digit]);
                if (start <= calc && calc < end) {
                    positions.push(j);
                }
            }
            return positions;
        };
        const growPaths = (branch, paths, radixes = [branch]) => {
            const candidates = getCandidates(branch);
            let idx = 0;
            for(const candidate of candidates) {
                const branchChildren = candidate.dig(node => isBranch(node) || isLeaf(node), {includeSelf: false});
                const info = candidateMap.get(candidate);
                // pathsからinfo.prod個選定して渡すことは確定
                const positions = getMixedRadixPositions(idx, (idx + info.prod), paths.length, branch, radixes);
                const targetBranchs = positions.map(i => paths[i]);
                for(const child of branchChildren) {
                    if(isBranch(child)) {
                        const newBranch = child;
                        growPaths(newBranch, targetBranchs, info.radixes);
                    } else {
                        const leaf = child;
                        for(const path of targetBranchs) {
                            path.push(leaf);
                        }
                    }
                }
                idx += info.prod;
            }
            return paths;
        };
        growPaths(root, paths);
        const result = paths.map(path => {
            return path.filter(node => {
                if(node.start < this.start) {
                    return acrossLeft;
                }
                if(node.start === this.start) {
                    return includeSelf;
                }
                return acrossRight;
            }).map(node => {
                if(!returnPath) {
                    return node;
                }
                const leafToRootPath = node.climb(n => n.isUserBranch, {all: true});
                const sharedRoots = leafToRootPath.filter((cur) => toRootPathSet.has(cur));
                const sharedRoot = toRootPath[sharedRoots.length - 1];
                // const path = this.climb(parent => parent === sharedRoot, {until: true}).reverse();
                // path.push(...node.climb(parent => parent === sharedRoot, {until: true}).slice(1));
                const path = toRootPath.slice(sharedRoots.length - 1).reverse();
                path.push(...leafToRootPath.slice(leafToRootPath.length));
                return {node, path};
            });
        })
        if(followOr) {
            return result;
        }
        return result[0];
    }
}

// BNFの依存関係を解析することがメインタスクのBNF管理クラス
class BnfAstManager extends AbstractManager {
    #BnfClass = {};
    #nameSpace = this.#newSpace('global');
    #parserGenerator = null;
    #classCategorizer = null;
    constructor(
        {NonTerminal, Name, Assign, AssignRight, AssignLeft, RightValue}, 
        category
    ) {
        super();
        this.#BnfClass.NonTerminal = NonTerminal;
        this.#BnfClass.Name = Name;
        this.#BnfClass.Assign = Assign;
        this.#BnfClass.AssignRight = AssignRight;
        this.#BnfClass.AssignLeft = AssignLeft;
        this.#BnfClass.RightValue = RightValue;
        const required = ['NonTerminal', 'Name', 'Assign', 'AssignRight', 'AssignLeft', 'RightValue'];
        for (const key of required) {
            if (!this.#BnfClass[key]) throw new BnfLayerError(`Missing required class definition: ${key}`, Error);
        }
        this.#classCategorizer = new ClassCategorizer(category);
    }
    get classCategorizer() {
        return this.#classCategorizer;
    }
    get leafCategorizer() {
        return this.#classCategorizer.leafCategorizer;
    }
    nodeTraits(cls) {
        return this.classCategorizer.nodeTraits(cls);
    }
    get root() {
        return super.root;
    }
    set root(bnfAstNode) {
        const res = super.root = bnfAstNode;
        this.#declare();
        this.#assign();
        this._hookAfterAnalyze(res);
        return res;
    }
    _hookAfterAnalyze(rootBnfAstNode) {
        // protected関数のつもり
    }
    get Cls() {
        return this.#BnfClass;
    }
    get parserType() {
        return "LL";
    }
    set parserGenerator(val) {
        return this.#parserGenerator = val;
    }
    get parserGenerator() {
        return this.#parserGenerator;
    }
    get selectLogic() {
        return globalSelectLogic;
    }
    #newSpace(name, parent = null) {
        const space = {
            parent: parent,
            name: name,
            syntaxParser: undefined,
            left: undefined,
            right: undefined,
            argNames: undefined,
            field: new Map,
            // 以下，左再帰処理用
            firstTerms: [],
            firstHierarchies: [],
            recursiveFirstTerms: [],
            allHierarchies: [],
            reverseHierarchies: [],
        };
        Object.defineProperty(space, "hasNonRecursiveTerms", {
            get: () => {
                return space.firstTerms.length !== space.recursiveFirstTerms.length;
            },
            configurable: true,
        });
        return space;
    }
    #Str2hierarchy(str) {
        const {
            NonTerminal,
        } = this.Cls;
        const nonTerminal = NonTerminal.getOrCreate(this.parserGenerator);
        const strObj = new StringObject(str);
        const bnfAstNode = nonTerminal.primaryParser.parse(strObj).node;
        return NonTerminal.nameHierarchy(bnfAstNode);
    }
    #getNameSpace(nameHierarchy, rootSpace = this.#nameSpace) {
        const {
            Name,
            NonTerminal,
        } = this.Cls;
        nameHierarchy.map(bnfAstNode => bnfAstNode.assertBaseInstanceOf(Name));
        let currentSpace = rootSpace;
        const declared = [];
        for(const bnfAstNode of nameHierarchy) {
            const name = bnfAstNode.bnfStr;
            declared.push(name);
            if(!currentSpace.field.has(name)) {
                throw new BnfLayerError(
                    (
                        nameHierarchy[0].pos ? 
                        'Line:' + nameHierarchy[0].pos.line + ' ' +
                        'Column:' + nameHierarchy[0].pos.column + '\n' : ''
                    ) +
                    declared.join(NonTerminal.selector) + ' is not declared.',
                    ReferenceError
                );
            }
            currentSpace = currentSpace.field.get(name);
        }
        return currentSpace;
    }
    _getNameSpaceByStr(entryPoint, rootSpace = this.#nameSpace) {
        // protectedな関数のつもり
        return this.#getNameSpaceByStr(entryPoint, rootSpace);
    }
    #getNameSpaceByStr(entryPoint, rootSpace = this.#nameSpace) {
        const ep = this.#Str2hierarchy(entryPoint);
        const field = (() => {
            try {
                return this.#getNameSpace(ep, rootSpace);
            } catch(e) {
                throw new BnfLayerError(`Entrypoint: ${entryPoint} is not declared.`, ReferenceError);
            }
        })();
        return field;
    }
    #serializeNameSpace(nameSpace) {
        const spaces = [];
        const getParsers = space => {
            if(space.right) {
                spaces.push(space);
            }
            for(const [key, val] of space.field) {
                getParsers(val);
            }
        };
        getParsers(nameSpace);
        return spaces.sort(BnfAstManager.ComparePosition);
    }
    static ComparePosition(l, r) {
        if(l.left.pos.line !== r.left.pos.line) {
            return l.left.pos.line - r.left.pos.line;
        }
        return l.left.pos.column - r.left.pos.column;
    }
    #getRelatedNameSpaces(nameSpace) {
        const {
            NonTerminal,
        } = this.Cls;
        const recursiveSpaces = 
            nameSpace.recursiveFirstTerms.map(term => NonTerminal.nameHierarchy(term))
            .map(nameHierarchy => this.#getNameSpace(nameHierarchy));
        const set = new Set;
        for(const root of recursiveSpaces) {
            const spaces = this.#serializeNameSpace(root);
            for(const space of spaces) {
                set.add(space);
            }
        }
        const spaces = Array.from(set).sort(BnfAstManager.ComparePosition);
        return spaces;
    }
    // 左再帰に関して最大のSCC（強連結成分）を検出し，
    // SCCに含まれる要素のうちentryPointから直接到達可能なノードについて
    // 左再帰実行用のWrap処理を追加する．
    #resolveLeftRecursionsFrom(entryPoint) {
        const {
            Assign,
            AssignRight,
            NonTerminal,
        } = this.Cls;
        // 左再帰の確認をするために，先頭要素の情報と逆検索情報をnameSpaceにバラまく．
        {
            const map = new Map;
            const stopper = bnfAstNode => {
                if(bnfAstNode.baseType === Assign) {
                    return bnfAstNode;
                }
                return false;
            };
            const process = bnfAstNode => {
                const [left, right] = bnfAstNode.instance.constructor.assign(bnfAstNode);
                const hierarchy = left.nameHierarchy;
                // Nullableの場合，左からの無限再帰を止められないため除外する．
                // UserNonTerminalでない要素は終端文字になるが，終端文字では再帰処理が絶対に発生しない．
                // よって，右辺要素の中で最初に現れるNullableでない要素の中から，UserNonTerminal型を抽出する．
                const firstTerms = AssignRight.getMostLeftNotNullableTerms(right)
                    .map(t => t.digOne(NonTerminal, {required: false})).filter(t => t);
                const firstHierarchies = firstTerms.map(t => NonTerminal.nameHierarchy(t));
                const allTerms = AssignRight.getAllTerms(right)
                    .map(t => t.digOne(NonTerminal, {required: false})).filter(t => t);
                const allHierarchies = (() => {
                    const hierarchies = allTerms.map(t => NonTerminal.nameHierarchy(t));
                    const map = new Map;
                    for(const hierarchy of hierarchies) {
                        const hStr = hierarchy.map(t => t.bnfStr).join(NonTerminal.selector);
                        map.set(hStr, hierarchy);
                    }
                    return [...map.values()];
                })();
                map.set(hierarchy, [firstHierarchies, allHierarchies, firstTerms]);
            };
            this.root.recursive(stopper, process);
            for(const [hierarchy, [firstHierarchies, allHierarchies, firstTerms]] of map) {
                const nameSpace = this.#getNameSpace(hierarchy);
                nameSpace.firstHierarchies = firstHierarchies;
                nameSpace.firstTerms = firstTerms;
                nameSpace.allHierarchies = allHierarchies;
                for(const revHierarchy of allHierarchies) {
                    const s = this.#getNameSpace(revHierarchy);
                    const spaces = this.#serializeNameSpace(s);
                    for(const space of spaces) {
                        space.reverseHierarchies.push(hierarchy);
                    }
                }
            }
        }
        // SCC群を作成する
        const sccList = [];
        const ep = this.#getNameSpaceByStr(entryPoint);
        {
            const getLeftRecursiveTerms = scc => {
                const map = new Map;
                for(const nameSpace of scc) {
                    const hitTerms = nameSpace.firstTerms.filter(term => {
                        const hierarchy = NonTerminal.nameHierarchy(term);
                        const spaces = new Set(this.#serializeNameSpace(this.#getNameSpace(hierarchy)));
                        return spaces.intersection(scc).size;
                    });
                    map.set(nameSpace, hitTerms);
                }
                return map;
            };
            {
                // Tarjan's algorithm
                let index = 0;
                const stack = [];
                const onStack = new Set;
                const indices = new Map;
                const lowLink = new Map;
                const strongConnect = (node, getChildren) => {
                    indices.set(node, index);
                    lowLink.set(node, index);
                    index++;
                    stack.push(node);
                    onStack.add(node);
                    for(const neighbor of getChildren(node)) {
                        if(!indices.has(neighbor)) {
                            strongConnect(neighbor, getChildren);
                            lowLink.set(node, Math.min(lowLink.get(node), lowLink.get(neighbor)));
                        } else if (onStack.has(neighbor)) {
                            lowLink.set(node, Math.min(lowLink.get(node), indices.get(neighbor)));
                        }
                    }
                    if(lowLink.get(node) === indices.get(node)) {
                        const scc = new Set;
                        while(1) {
                            const n = stack.pop();
                            onStack.delete(n);
                            scc.add(n);
                            if(n === node) {
                                break;
                            }
                        }
                        const map = getLeftRecursiveTerms(scc);
                        if(map.get(node).length) {
                            sccList.push(scc);
                            for(const nameSpace of scc) {
                                nameSpace.recursiveFirstTerms = map.get(nameSpace);
                                for(const term of nameSpace.recursiveFirstTerms) {
                                    term.isRecursive = true;
                                }
                            }
                        }
                    }
                };
                const getChildren = nameSpace => {
                    const hierarchies = nameSpace.firstHierarchies;
                    const children = hierarchies.map(h => this.#getNameSpace(h))
                    .reduce((acc, space) => {
                        for(const s of this.#serializeNameSpace(space)) {
                            acc.push(s);
                        }
                        return acc;
                    }, []);
                    return children;
                };
                strongConnect(ep, getChildren);
            }
        }
        // Wrap対象となるノード群を調べる
        // Wrap対象：SCC群の中でエントリポイントに面しているノード群．
        // （同一SCCノードを除外した上でエントリポイントまでDFSで到達可能か調べる）
        const recursionEntryPoints = [];
        {
            const getChildren = nameSpace => {
                const hierarchies = nameSpace.reverseHierarchies;
                const children = hierarchies.map(h => this.#getNameSpace(h))
                .reduce((acc, space) => {
                    for(const s of this.#serializeNameSpace(space)) {
                        acc.push(s);
                    }
                    return acc;
                }, []);
                return children;
            };
            const dfs = (node, goal, nexts, excludes, visited = new Set) => {
                if(node === goal) {
                    return true;
                }
                if(visited.has(node)) {
                    return false;
                }
                visited.add(node);
                for(const child of nexts(node)) {
                    if(excludes.has(child)) {
                        continue;
                    }
                    if(dfs(child, goal, nexts, excludes, visited)) {
                        return true;
                    }
                }
                return false;
            };
            for(const scc of sccList) {
                for(const nameSpace of scc) {
                    if(dfs(nameSpace, ep, getChildren, scc)) {
                        recursionEntryPoints.push(nameSpace);
                    }
                }
            }
        }
        for(const nameSpace of recursionEntryPoints) {
            if(globalLeftRecursiveApproach === LeftRecursiveApproach.toLoop) {
                // wrapTargetsのsyntaxParserに左再帰対策のWrapを施す．
                this.#unrollLeftRecursion(nameSpace);
            } else if (globalLeftRecursiveApproach === LeftRecursiveApproach.toRightRecursionAndAstRebuild) {
                this.#toRightRecursion(nameSpace);
            }
        }
    }
    #unrollLeftRecursion(target) {
        const {
            NonTerminal,
            RightValue,
        } = this.Cls;
        const nameSpace = target;
        const {right, left, recursiveFirstTerms} = nameSpace;
        const relatedSpaces = this.#getRelatedNameSpaces(nameSpace);
        const relatedCond = relatedSpaces.filter(space => space.hasNonRecursiveTerms);
        if(relatedCond.length === 0) {
            const fullName = this.getFullName(nameSpace, true);
            throw new BnfLayerError(
                `Left-recursive rule requires at least one base (non-recursive) case to terminate. ` +
                `(Line:${nameSpace.left.pos.line} Column:${nameSpace.left.pos.column} ` +
                `${fullName})`, TypeError);
        }
        const recSet = new Set(recursiveFirstTerms);
        const ownRightValues = right.dig(RightValue);
        const recursiveRVs = ownRightValues.filter(node => {
            const set = new Set(node.dig(NonTerminal));
            return set.intersection(recSet).size;
        });
        const nonRecursiveRVs = ownRightValues.filter(node => {
            const set = new Set(node.dig(NonTerminal));
            return set.intersection(recSet).size === 0;
        });
        // AssignRightの下位要素を直接呼び出す．
        // ただし，左再帰を含むルートと含まないルートで分離する．
        const baseCase = right.children[0].generateSecondaryParserWithout(recursiveRVs);
        const recursiveCase = right.children[0].generateSecondaryParserWithout(nonRecursiveRVs);
        Object.defineProperty(nameSpace, "localSyntaxParser", {
            get: () => {
                const baseParser = nameSpace.baseParser;
                const recursiveParser = nameSpace.recursiveParser;
                const test = (strObj, index, cur) => {
                    const cache = BaseAstNode.getCache(left, strObj, cur);
                    if(!cache.has(index)) {
                        cache.set(index, {result:null, inProgress:true, length: undefined, results:[]});
                    }
                    const hist = cache.get(index);
                    if(!hist.inProgress) {
                        return hist.result;
                    }
                    let seed = baseParser.test(strObj, index, cur);
                    seed.start = index;
                    hist.results.push(seed);
                    if(!seed.success) {
                        hist.result = seed;
                        hist.inProgress = false;
                        return seed;
                    }
                    // seed: {success, length, start}
                    seed.inProgress = true;
                    while(1) {
                        const result = recursiveParser.test(strObj, index, seed);
                        if(result.success && (result.length > seed.length)) {
                            result.start = index;
                            seed.inProgress = false;
                            seed = result;
                            seed.inProgress = true;
                            hist.results.push(result);
                        } else {
                            break;
                        }
                    }
                    hist.inProgress = false;
                    seed.inProgress = false;
                    hist.result = seed;
                    return seed;
                };
                // Wrapperを使用せず直接parseを記述するのは，
                // ・定義上再帰構造なparseをloop展開するため
                // ・再帰を展開した結果の入手方法がcacheシステム依存のため
                //     ・上記に関しては，resultにオブジェクトで持たせることもできそう．
                const parse = (strObj, seed) => {
                    const cache = BaseAstNode.getCache(left, strObj, seed);
                    const index = strObj.ptr;
                    const result = test(strObj, index, seed);
                    const hist = cache.get(index);
                    if(!result.success) {
                        return null;
                    }
                    const results = hist.results;
                    const parent = baseParser.parse(strObj, results[0]);
                    if(results.length === 1) {
                        return parent;
                    }
                    let leaf = parent;
                    for(const seed of results.slice(1)) {
                        leaf.node.isBoundary = true;
                        const parent = recursiveParser.parse(strObj, seed);
                        parent.node.digOne(DummyOperand, {required: true}).swap(leaf.node);
                        const nonUserTerminal = leaf.node.parent;
                        nonUserTerminal.nameHierarchy = this.getFullName(leaf.space);
                        leaf = parent;
                    }
                    return leaf;
                };
                return {test, parse};
            },
            configurable: true,
        })
        const parser = (accessor, selectLogic = right.bnfAstManager.selectLogic) => {
            const spaces = relatedSpaces.filter(space => space[accessor]);
            const test = (strObj, index, seed) => {
                let max = {
                    success: false,
                    length: undefined,
                };
                for(const space of spaces) {
                    const parser = space[accessor];
                    const result = parser.test(strObj, index, seed);
                    if(result.success && (!max.success || (max.length < result.length))) {
                        max = result;
                        result.space = space;
                        if(selectLogic === SelectLogic.first) {
                            return max;
                        }
                    }
                }
                return max;
            }
            const parse = (strObj, seed) => {
                const testResult = test(strObj, strObj.ptr, seed);
                const result = testResult.space[accessor].parse(strObj, seed);
                result.space = testResult.space;
                return result;
            }
            return {test, parse};
        };
        Object.defineProperty(nameSpace, "baseParser", {
            get: () => {
                return parser('localBaseParser');
            },
            configurable: true,
        });
        Object.defineProperty(nameSpace, "recursiveParser", {
            get: () => {
                return parser('localRecursiveParser');
            },
            configurable: true,
        });
        Object.defineProperty(nameSpace, "localBaseParser", {
            get: () => {
                return baseCase;
            },
            configurable: true,
        });
        Object.defineProperty(nameSpace, "localRecursiveParser", {
            get: () => {
                return recursiveCase;
            },
            configurable: true,
        });
    }
    #toRightRecursion(target) {
        throw new NotImplementedError;
    }
    #declare() {
        const {AssignLeft} = this.Cls;
        const stopper = bnfAstNode => {
            if(bnfAstNode.baseType === AssignLeft) {
                return bnfAstNode;
            }
            return false;
        };
        const process = bnfAstNode => {
            this.#declareBody(bnfAstNode);
        };
        this.root.recursive(stopper, process);
    }
    #assign() {
        const {Assign} = this.Cls;
        const stopper = bnfAstNode => {
            if(bnfAstNode.baseType === Assign) {
                return bnfAstNode;
            }
            return false;
        };
        const process = bnfAstNode => {
            const [left, right] = Assign.assign(bnfAstNode);
            this.#assignBody(left, right);
        };
        this.root.recursive(stopper, process);
    }
    getFullName(nameSpace, isStr = false) {
        const {
            NonTerminal,
        } = this.Cls;
        const hierarchy = [];
        const rec = space => {
            if(space.parent) {
                rec(space.parent);
            }
            hierarchy.push(space);
        };
        rec(nameSpace);
        while(hierarchy.length) {
            const space = hierarchy.shift();
            if(space === this.#nameSpace) {
                break;
            }
        }
        if(isStr) {
            return hierarchy.map(space => space.name).join(NonTerminal.selector);
        }
        return {
            hierarchy: hierarchy.map(space => space.name),
            selector: NonTerminal.selector,
        };
    }
    #getSpacesByNonTerminal(bnfAstNode) {
        const {
            NonTerminal,
        } = this.Cls;
        bnfAstNode.assertBaseInstanceOf(NonTerminal);
        const space = bnfAstNode.nameSpace || this.#nameSpace;
        const nameHierarchy = bnfAstNode.baseType.nameHierarchy(bnfAstNode);
        const spaces = this.#serializeNameSpace(this.#getNameSpace(nameHierarchy, space));
        return spaces;
    }
    getAssignRights(bnfAstNode) {
        return this.#getSpacesByNonTerminal(bnfAstNode).map(space => space.right);
    }
    serializeAssignRight(right) {
        const {
            RightValue,
            AssignRight,
        } = this.Cls;
        right.assertBaseInstanceOf(AssignRight);
        const result = right.dig(RightValue);
        return result;
    }
    getSecondaryParser(bnfAstNode) {
        const spaces = this.#getSpacesByNonTerminal(bnfAstNode);
        const parsers = spaces.map(space => space.syntaxParser);
        const selectLogic = bnfAstNode.bnfAstManager.selectLogic;
        const test = (strObj, index, seed) => {
            const results = parsers.map(parser => parser.test(strObj, index, seed));
            const select = (() => {
                let max = {
                    success: false,
                    length: 0,
                    candidate: undefined,
                    result: undefined,
                };
                for(const [i, result] of results.entries()) {
                    if(!result.success) {
                        continue;
                    }
                    if(!max.success || (max.length < result.length)) {
                        max.success = true;
                        max.length = result.length;
                        max.space = result.space ? result.space : spaces[i];
                        max.candidate = i;
                        max.result = result;
                    }
                    if(selectLogic === SelectLogic.first) {
                        break;
                    }
                }
                return max;
            })();
            return select;
        };
        const process = (astNode, strObj, result, seed) => {
            const child = parsers[result.candidate].parse(strObj, seed);
            astNode.addChild(child.node);
        };
        return AstNode.parserWrapper(bnfAstNode, test, process);
    }
    #declareBody(left, rootSpace = this.#nameSpace) {
        const {
            NonTerminal,
        } = this.Cls;
        const nameHierarchy = left.nameHierarchy;
        const argNames = left.argNames;
        left.digOne(NonTerminal, {required: true}).nameSpace = rootSpace;
        let currentSpace = rootSpace;
        for(const bnfAstNode of nameHierarchy) {
            const name = bnfAstNode.bnfStr;
            if(!currentSpace.field.has(name)) {
                const newSpace = this.#newSpace(name, currentSpace);
                currentSpace.field.set(name, newSpace);
            }
            currentSpace = currentSpace.field.get(name);
        }
        currentSpace.argNames = argNames?.map(bnfAstNode => bnfAstNode.bnfStr);
        return currentSpace;
    }
    #assignBody(left, right, rootSpace = this.#nameSpace) {
        const {
            AssignRight,
        } = this.Cls;
        const hierarchy = left.nameHierarchy;
        const nameSpace = this.#getNameSpace(hierarchy, rootSpace);
        nameSpace.left = left;
        nameSpace.right = right;
        Object.defineProperty(nameSpace, "syntaxParser", {
            get: () => {
                // nameSpaceから該当するパーサーを呼び出す
                const parser = nameSpace.localSyntaxParser;
                const test = (strObj, index, seed) => {
                    const result = parser.test(strObj, index, seed);
                    if(!result.space) {
                        result.space = nameSpace;
                    }
                    return result;
                };
                const parse = ((strObj, seed) => {
                    const obj = parser.parse(strObj, seed);
                    // 実行結果に境界線を設定することで，ルール同士の境界を外部で判断しやすくする．
                    if(obj.node) {
                        for(const child of obj.node.children) {
                            child.isBoundary = true;
                        }
                    }
                    return obj;
                });
                return {test, parse};
            },
            configurable: true,
        });
        Object.defineProperty(nameSpace, "localSyntaxParser", {
            get: () => {
                // assign時点では左再帰未対策のため，getterで登録する．
                // 基本，左再帰はないものとして基底パーサを呼び出す．
                return nameSpace.localBaseParser;
            },
            configurable: true,
        });
        // 左再帰を含まない基本的な解析ルート
        Object.defineProperty(nameSpace, "localBaseParser", {
            get: () => {
                // assign時点では左再帰未対策のため，getterで登録する．
                const syntaxParser = AssignRight[this.parserType].generateSecondaryParser(nameSpace.right);
                return syntaxParser;
            },
            configurable: true,
        });
        // 左再帰を含む解析ルート
        // 基本は存在しない．
        Object.defineProperty(nameSpace, "localRecursiveParser", {
            get: () => {
                return null;
            },
            configurable: true,
        });
    }
    declare(...args) {
        this.#declareBody(...args);
    }
    assign(...args) {
        this.#assignBody(...args);
    }
    getParser(entryPoint = 'expr', withSystemScope = undefined, resolveRelfRecursion = false) {
        const {
            Assign,
            NonTerminal,
        } = this.Cls;
        if(resolveRelfRecursion) {
            this.#resolveLeftRecursionsFrom(entryPoint);
        }
        const field = (() => {
            if(!withSystemScope) {
                return this.#getNameSpaceByStr(entryPoint);
            }
            const systemSpace = this.#newSpace('systemSpace');
            systemSpace.field.set('userSpace', this.#nameSpace);
            const newEntryPointName = withSystemScope(systemSpace);
            const field = this.#getNameSpaceByStr(newEntryPointName, systemSpace);
            return field;
        })();
        const bnfAstNode = field.left.children.find(t => t.baseType === NonTerminal);
        return bnfAstNode.generateSecondaryParser;
    }
    getAllRuleName(rootSpace = this.#nameSpace) {
        const {NonTerminal} = this.Cls;
        const names  = this.#serializeNameSpace(rootSpace)
            .map(
                space => space.left.nameHierarchy.map(node => node.str)
                .join(NonTerminal.selector)
            );
        return names;
    }
    declareAndAssignFromLeftRightStr(leftStr, rightStr, nameSpace) {
        const Assign = this.Cls.Assign;
        const bnfAstNode = Assign.generateAssignFromLeftRightStr(leftStr, rightStr, this.parserGenerator);
        const [left, right] = Assign.assign(bnfAstNode);
        this.declare(left, nameSpace);
        this.assign(left, right, nameSpace);
        bnfAstNode.setManager(this);
        return;
    }
    dump(root, option = {}) {
        // Bnfの構造木dumpはCoreWhiteを除く
        const excluder = bnfAstNode => {
            return bnfAstNode.baseType === CoreWhite || bnfAstNode.parent.isUserLeaf;
        };
        if(option.excluder) {
            const org = option.excluder;
            option.excluder = bnfAstNode => {
                return org(bnfAstNode) || excluder(bnfAstNode);
            };
        } else {
            option.excluder = excluder;
        }
        return super.dump(root, option);
    }
}

class CoreAstNode extends BaseAstNode {
    #args;
    #define;
    #defineOverride = undefined;
    #parserGenerator = null;
    #lexicalAnalyzer = null;
    static genCount = 0;
    static get superCls() {
        return Object.getPrototypeOf(this);
    }
    constructor(parserGenerator, ...args) {
        super();
        this.#parserGenerator = parserGenerator;
        if(new.target === CoreAstNode) {
            throw new CoreLayerError("abstract class", TypeError);
        }
        this.#args = args;
        for(const arg of this.#args) {
            if(arg instanceof CoreAstNode) {
                arg.parent = this;
            }
        }
        for(const trait in this.nodeTraits) {
            if(trait in this) {
                new CoreLayerError(
                    `Trait(${trait}) is already defined.`, 
                    Error);
            }
            Object.defineProperty(this, trait, {
                get: () => this.nodeTraits[trait]
            })
        }
    }
    get nodeTraits() {
        if(this.parserGenerator) {
            return this.parserGenerator.nodeTraits(this.constructor);
        }
        return {};
    }
    set nodeTraits(val) {
        for(const key in val) {
            this.nodeTraits[key] = val[key];
        }
        return this.nodeTraits;
    }
    get parserGenerator() {
        return this.#parserGenerator;
    }
    static get newDummyNode() {
        const node = new this;
        return node;
    }
    get ErrorLayer() {
        return CoreLayerError;
    }
    set lexicalAnalyzer(val) {
        return this.#lexicalAnalyzer = val;
    }
    get lexicalAnalyzer() {
        if(this.#lexicalAnalyzer) {
            return this.#lexicalAnalyzer;
        }
        if(this.parent) {
            this.#lexicalAnalyzer = this.parent.lexicalAnalyzer;
            return this.#lexicalAnalyzer;
        }
    }
    static baseType() {
        return this.constructor;
    }
    static CompareNodeType(left, right) {
        return (left instanceof CoreAstNode) && (right instanceof CoreAstNode);
    }
    // Core, User共通のUtil関数
    static get upperAst() {
        return BnfAstNode;
    }
    get args() {
        return this.#args;
    }
    get isEnclosure() {
        return false;
    }
    get isInEnclosure() {
        if(!this.parent) {
            return false;
        }
        if(this.parent.isEnclosure) {
            return true;
        }
        return this.parent.isInEnclosure;
    }
    get isMyRepeater() {
        return false;
    }
    overrideOperandsForPreprocess(cond, mapperFn, visited = new Set) {
        if (typeof mapperFn !== 'function') {
            new CoreLayerError("mapperFn must be a function", Error);
        }
        // キャッシュ機能が有効な時，子孫要素に自身が現れる可能性があるためvisitedをメモしておく
        visited.add(this);
        if(cond(this)) {
            this.#defineOverride = mapperFn(this.#operands.slice(), this);
            this.override = true;
        }
        for(const operand of this.operands) {
            if(visited.has(operand)) {
                continue;
            }
            // operandsはaddChildクラスを通じて作られたchildrenを参照していて，
            // addChild関数はCompareNodeTypeによって検証されているため，
            // operandは必ずCoreAstNodeの派生クラス
            // なので，overrideOperandsForPreprocessを再帰呼出し可能
            operand.overrideOperandsForPreprocess(cond, mapperFn, visited);
        }
    }
    get operands() {
        if(this.#define === undefined) {
            this.setOperands(this.#operands);
        }
        return this.children;
    }
    get #operands() {
        if(this.#defineOverride) {
            return this.#defineOverride;
        }
        if("define" in this) {
            return this.define;
        }
        return this.args;
    }
    setOperands(val) {
        if(this.#define) {
            throw new CoreLayerError("Already operands defined.", SyntaxError);
        }
        for(const arg of val) {
            this.addChild(arg);
        }
        this.#define = true;
    }
    get primaryParser() {
        const operand = this;
        const test = (strObj, index) => {
            return operand.testBnf(strObj, index);
        };
        const process = (bnfAstNode, strObj, result, seed) => {
            operand.parseBnfProcess(bnfAstNode, strObj, result, seed);
        };
        return BnfAstNode.parserWrapper(operand, test, process);
    }
    // Core側の核となる関数（parseBnfProcess, test）
    parseBnfProcess(bnfAstNode, strObj, result) {
        strObj.shift(result.length);
        bnfAstNode.length = result.length;
    }
    testBnf(strObj, index) {
        throw new CoreLayerError(`Method testBnf must be implemented in subclass of ${this.constructor.name}`, NotImplementedError);
    }

    // User側は実装必須な関数
    // Core側は基本不要だが，CoreRepeaterに関してはUser側からも呼び出され，繰り返し処理自体が特殊なため実装済み
    // generateSyntaxParserは get bnfAstNode で生成したBNFについて，
    // 文字列の食べ方を定義するようなtest関数とparse関数を含むobjectを返す
    // test関数はstrObjと現在座標を受け取って，successとlengthを含むオブジェクトを返す非破壊関数
    // parse関数はstrObjを受け取ってtrue/falseを返す関数で，成功時はstrObjを消費し，bnfToken.childrenのparseを完了する
    // OuterClassと同じ基底クラスを持つようにしておく（superを同じノリで参照するため）
    static LL = class extends this.superCls {
        static generateSecondaryParser(bnfAstNode) {
            // this(CoreAstNode)はbaseType経由で参照することで継承を保証する．
            throw new CoreLayerError(bnfAstNode.baseType.name + '\'s generateSecondaryParser is not implemented.', NotImplementedError);
        }
    }
    static LR = class extends this.superCls {
        static generateSecondaryParser(bnfAstNode) {
            // this(CoreAstNode)はbaseType経由で参照することで継承を保証する．
            throw new CoreLayerError(bnfAstNode.baseType.name + '\'s generateSecondaryParser is not implemented.', NotImplementedError);
        }
    }
    static generateEvaluator(astNode) {
        // 特に指定がないとき，astNode.childrenからevaluateを得る
        if(astNode.children.length === 1) {
            return astNode.children[0].evaluator;
        }
        return new Evaluator(astNode.children.map(child => child.evaluator));
    }
    get name() {
        return this.constructor.name;
    }
    get label() {
        return this.constructor.name;
    }
    get canRewriteParent() {
        return false;
    }
    static IncrementCacheHit() {
        CoreAstNode.cacheHit++;
        super.IncrementCacheHit();
    }
    static IncrementCacheNouse() {
        CoreAstNode.cacheNouse++;
        super.IncrementCacheNouse();
    }
    static definedSet = new Set;
    static sameDefineCount = 0;
    static instanceManageDB = new Map;
    static reuseable = false;
    static instanceManager(...allArgs) {
        const first = allArgs[0];
        const rest = allArgs.slice(1, -1);
        const db = ((arg) => {
            if(arg instanceof Map) {
                return arg;
            }
            rest.push(arg);
            return this.instanceManageDB;
        })(allArgs.slice(-1)[0]);
        if(!db.has(first)) {
            db.set(first, {
                instance: null,
                db: new Map,
            });
        }
        const child = db.get(first);
        if(!rest.length) {
            return child;
        }
        return this.instanceManager(...rest, child.db);
    }
    static getOrCreate(...args) {
        CoreAstNode.genCount++;
        // return new this(...args);
        if(!this.reuseable) {
            return new this(...args);
        }
        const manager = this.instanceManager(this, ...args);
        if(!manager.instance) {
            manager.instance = new this(...args);
        } else {
            CoreAstNode.sameDefineCount++;
        }
        return manager.instance;
    }
    toJSON() {
        if(this.operands.length) {
            return {
                name: this.constructor.name,
                operands: this.operands,
            };
        }
        return {
            name: this.constructor.name,
            args: this.args
        };
    }
    syntaxLogText(bnfAstNode) {
        return bnfAstNode.bnfStr;
    }
}

class CoreAstManager extends AbstractManager {
    #entryPoint = null;
    #bnfAstManager = null;
    static get Cls() {
        new CoreLayerError(``, NotImplementedError);
    }
    static get entryPoint() {
        new CoreLayerError(``, NotImplementedError);
    }
    static get bnfAstManager() {
        new CoreLayerError(``, NotImplementedError);
    }
    get bnfAstManager() {
        return this.#bnfAstManager;
    }
    set bnfAstManager(val) {
        return this.#bnfAstManager = val;
    }
    get entryPoint() {
        return this.#entryPoint;
    }
    set entryPoint(val) {
        return this.#entryPoint = val;
    }
    analyze(str, category, hook) {
        const BaseClass = this.constructor;
        const strObj = new StringObject(str);
        this.#bnfAstManager = new BaseClass.bnfAstManager(BaseClass.Cls, category);
        this.#bnfAstManager.parserGenerator = this;
        this.#entryPoint = BaseClass.entryPoint.getOrCreate(this);
        if(hook) {
            hook(this.#entryPoint, this.#bnfAstManager);
        }
        this.#bnfAstManager.root = this.#entryPoint.primaryParser.parse(strObj).node;
    }
    get bnfStr() {
        return this.#bnfAstManager.root.bnfStr;
    }
    dumpBnfAST() {
        this.#bnfAstManager.dump();
    }
    nodeTraits(cls) {
        return this.#bnfAstManager.nodeTraits(cls);
    }
}

// 再帰する場合に使用する遅延生成器
class LazyGenerator extends CoreAstNode {
    #class = null;
    #args = [];
    #overrides = [];
    constructor(parserGenerator, classType, ...args) {
        super(parserGenerator);
        // TODO:現状の実装だとLazyGeneratorは
        // 直接的に階層構造を持つ定義を受け入れられない気がする．
        this.#class = classType;
        for(const arg of args) {
            this.#args.push(arg);
        }
    }
    generateOnDemand() {
        const args = this.#args.map(arg => {
            if(arg instanceof LazyGenerator) {
                return arg.generateOnDemand();
            }
            if(CoreAstNode.isSuperClassOf(arg)) {
                return (LazyGenerator.getOrCreate(this.parserGenerator, arg)).generateOnDemand();
            }
            return arg;
        });
        const newArg = this.#class.getOrCreate(this.parserGenerator, ...args);
        newArg.parent = this.parent;
        return newArg;
    }
    testBnf(str, index) {
        const newArg = this.generateOnDemand();
        newArg.isLazyGenerated = true;
        this.swap(newArg);
        // 覚えていた書き換えルールで上書きする
        for(const override of this.#overrides) {
            newArg.overrideOperandsForPreprocess(override.cond, override.mapperFn, override.visited);
        }
        return newArg.testBnf(str, index);
    }
    overrideOperandsForPreprocess(cond, mapperFn, visited) {
        // 遅延生成後に反映できるよう覚えておく．
        this.#overrides.push({cond, mapperFn, visited});
    }
}

class DummyOperand extends CoreAstNode {
}

class AbstractGroup extends CoreAstNode {
    parseBnfProcess(bnfAstNode, strObj, result, seed) {
        const operands = this.operands;
        for(const op of operands) {
            const child = op.primaryParser.parse(strObj, seed);
            bnfAstNode.addChild(child.node);
        }
    }
    
    testBnf(strObj, index) {
        const operands = this.operands;
        let length = 0;
        for(const op of operands) {
            const result = op.testBnf(strObj, index + length);
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
            length,
        };
    }
}

class CoreGroup extends AbstractGroup {
}
class CoreNonTerminal extends CoreGroup {
    #prev;
    #post;
    constructor(parserGenerator, prev, post) {
        super(parserGenerator);
        this.#prev = prev;
        this.#post = post;
    }
    testBnf(strObj, index) {
        if(this.#prev) {
            this.#prev(this, strObj, index);
        }
        const result = super.testBnf(strObj, index);
        if(this.#post) {
            this.#post(this, strObj, result, index);
        }
        return result;
    }
    set prev(val) {
        return this.#prev = val;
    }
    set post(val) {
        return this.#post = val;
    }
    get define() {
        return [
            Name.getOrCreate(this.parserGenerator),
            CoreAsterisk.getOrCreate(this.parserGenerator, 
                CoreTerminal.getOrCreate(this.parserGenerator, NonTerminal.selector),
                Name.getOrCreate(this.parserGenerator)
            )
        ];
    }
    static LL = class extends this.superCls {
        static generateSecondaryParser(bnfAstNode) {
            throw new CoreLayerError(bnfAstNode.baseType.name + '\'s generateSecondaryParser is not implemented.', NotImplementedError);
        }
    };
}

class CoreTerminal extends CoreAstNode {
    static reuseable = true;
    testBnf(strObj, index) {
        const len = this.args[0].length;
        const s = strObj.read(index, len);
        if(s !== this.args[0]) {
            return {
                success: false,
                length: undefined,
            };
        }
        return {
            success: true,
            length: len,
        };
    }
    setOperands(val) {
        super.setOperands([]);
    }
}

class CoreWhite extends CoreNonTerminal {
    get define() {
        return [
            CoreAsterisk.getOrCreate(this.parserGenerator, 
                CoreOr.getOrCreate(
                    this.parserGenerator, 
                    CoreComment.getOrCreate(this.parserGenerator), 
                    CoreWhiteSpace.getOrCreate(this.parserGenerator),
                )
            ),
        ];
    }
    // カッコ外かどうかを判定し，改行を除外する関数
    static whiteExcluder(self) {
        if(self.isInEnclosure) {
            // カッコ内であれば通常通り改行も正しく処理できる
            return;
        }
        // カッコ外では改行を処理できないので除外する
        self.operands[0].operands[0].operands.filter(op => op instanceof CoreWhiteSpace).forEach(op => {
            op.exclude = '\n';
        });
    }
}

class CoreComment extends CoreTerminal {
    testBnf(strObj, index) {
        const start = strObj.read(index, 2);
        let length = 0;
        if(!(start === "//" || start === "/*")) {
            return {
                success: false,
                length: undefined
            };
        }
        length += 2;
        let c = strObj.read(index + length, 1);
        length++;
        if(start === "//") {
            while(c !== "") {
                if(c === "\n") {
                    break;
                }
                c = strObj.read(index + length, 1);
                length++;
            }
            return {
                success: true,
                length
            };
        }
        let prev = c;
        c = strObj.read(index + length, 1);
        length++;
        while(c !== "") {
            if(prev + c === "*/") {
                return {
                    success: true,
                    length,
                };
            }
            prev = c;
            c = strObj.read(index + length, 1);
            length++;
        }
        return {
            success: false,
            length: undefined
        };
    }
}

class CoreWhiteSpace extends CoreTerminal {
    #include = new Set;
    #exclude = new Set;
    constructor(parserGenerator, ...args) {
        super(parserGenerator, ...args);
        this.include = " \n\t";
    }
    static isString(value) {
        return typeof value === 'string' || value instanceof String;
    }
    get include() {
        return this.#include.difference(this.#exclude);
    }
    set include(val) {
        if(CoreWhiteSpace.isString(val)) {
            for(const c of val.split('')) {
                this.#include.add(c);
            }
        } else if(val instanceof Array || val instanceof Set) {
            for(const o of val) {
                this.#include.add(o);
            }
        }
    }
    set exclude(val) {
        if(CoreWhiteSpace.isString(val)) {
            for(const c of val.split('')) {
                this.#exclude.add(c);
            }
        } else if(val instanceof Array || val instanceof Set) {
            for(const o of val) {
                this.#exclude.add(o);
            }
        }
    }
    testBnf(strObj, index) {
        let length = 0;
        let c = strObj.read(index + length, 1);
        while(c !== "") {
            if(!(this.include.has(c))) {
                break;
            }
            length++;
            c = strObj.read(index + length, 1);
        }
        return {
            success: true,
            length
        };

    }
}

class UserCoreGroup extends AbstractGroup {
    static valids(bnfAstNode) {
        if(bnfAstNode.valids === undefined) {
            return [0];
        }
        return bnfAstNode.valids;
    }
    static generateEvaluator(astNode) {
        if(astNode.children.length === 1) {
            return astNode.children[0].evaluator;
        }
        return new Evaluator(astNode.children.map(child => child.evaluator));
    }
    static LL = class extends this.superCls {
        static generateSecondaryParser(bnfAstNode) {
            const children = bnfAstNode.baseType.valids(bnfAstNode).map(i => bnfAstNode.children[i]);
            const parsers = children.map(t => t.generateSecondaryParser);
            const test = (strObj, index, seed) => {
                let length = 0;
                for(const [i, parser] of parsers.entries()) {
                    const result = parser.test(strObj, index, seed);
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
                    length
                };
            };
            const process = (astNode, strObj, result, seed) => {
                for(const parser of parsers) {
                    const child = parser.parse(strObj, seed);
                    astNode.addChild(child.node);
                }
            };
            return AstNode.parserWrapper(bnfAstNode, test, process);
        }
    };
}

class AbstractRepeater extends CoreGroup {
}

// コアとなる構文解析用の繰り返しクラス
class CoreRepeater extends AbstractRepeater {
    #min = 0;
    #max = Infinity;
    #count;
    constructor(parserGenerator, ...args) {
        if(args.length > 1) {
            args = [CoreGroup.getOrCreate(parserGenerator, ...args)];
        }
        super(parserGenerator, ...args);
    }
    get Src() {
        return this.args[0];
    }
    set min(val) {
        return this.#min = val;
    }
    set max(val) {
        return this.#max = val;
    }
    parseBnfProcess(bnfAstNode, strObj, result, seed) {
        for(let i = 0; i < result.count; i++) {
            const child = this.Src.primaryParser.parse(strObj, seed);
            bnfAstNode.addChild(child.node);
        }
        bnfAstNode.count = result.count;
    }
    RepeatTest(strObj, index, min = this.#min, max = this.#max) {
        let count = 0;
        let length = 0;
        const lens = [];
        while(strObj.str !== "") {
            const result = this.Src.testBnf(strObj, index + length);
            if(!result.success || result.length === 0) {
                break;
            }
            length += result.length;
            lens.push(result.length);
            count++;
            if(count >= max) {
                break;
            }
        }
        if(min <= count) {
            return {
                success: true,
                length,
                count,
                lens,
            };
        }
        return {
            success: false,
            length: undefined,
            count: undefined,
            lens: undefined,
        };
    }
    get count() {
        return this.#count;
    }
    testBnf(strObj, index) {
        return this.RepeatTest(strObj, index);
    }
}

class CoreAsterisk extends CoreRepeater {
    constructor(parserGenerator, ...args) {
        super(parserGenerator, ...args);
        this.min = 0;
        this.max = Infinity;
    }
}

class CoreOption extends CoreRepeater {
    constructor(parserGenerator, ...args) {
        if(args.length > 1) {
            args = [CoreGroup.getOrCreate(parserGenerator, ...args)];
        }
        super(parserGenerator, ...args);
        this.min = 0;
        this.max = 1;
    }
}

class CorePlus extends CoreRepeater {
    constructor(parserGenerator, ...args) {
        super(parserGenerator, ...args);
        this.min = 1;
        this.max = Infinity;
    }
}

class CoreOr extends CoreGroup {
    #hitter = null;
    get selectLogic() {
        return SelectLogic.max;
    }
    parseBnfProcess(bnfAstNode, strObj, result, seed) {
        const hitter = this.operands[result.index];
        const child = hitter.primaryParser.parse(strObj, seed);
        this.#hitter = result.index;
        bnfAstNode.addChild(child.node);
    }
    // ヒットした要素の中から最長のものを選択し，result.indexとしてparseBnfProcessに渡す．
    testBnf(strObj, index) {
        const hits = [];
        this.#hitter = null;
        for(const [i, arg] of this.operands.entries()) {
            const result = arg.testBnf(strObj, index);
            if(result.success) {
                hits.push({index:i, length: result.length});
                if(this.selectLogic === SelectLogic.first) {
                    break;
                }
            }
        }
        if(hits.length === 0) {
            return {
                success: false,
                length: undefined,
                index: null
            };
        }
        const max = hits.reduce((acc, cur) => {
            if(cur.length > acc.length) {
                return cur;
            }
            return acc;
        }, hits[0]);
        return {
            success: true,
            length: max.length,
            index: max.index
        };
    }
    get hitIndex() {
        return this.#hitter;
    }
}


class CoreTerminalDot extends CoreTerminal {
    testBnf(strObj, index) {
        const c = strObj.read(index, 1);
        if(c === "") {
            return {
                success: false,
                length: undefined,
            };
        }
        return {
            success: true,
            length: 1,
        };
    }
}

class CoreTerminalSet extends CoreTerminal {
    constructor(parserGenerator, ...args) {
        super(parserGenerator, ...args);
        const strs = args.reduce((acc, cur) => acc + cur, "").split('');
        this.set = new Set(strs);
    }
    testBnf(strObj, index) {
        const c = strObj.read(index, 1);
        if(!this.set.has(c)) {
            return {
                success: false,
                length: undefined,
            };
        }
        return {
            success: true,
            length: 1,
        };
    }
}

class CoreNegTerminalSet extends CoreTerminalSet {
    static char(bnfAstNode) {
        return bnfAstNode.bnfStr;
    }
    testBnf(strObj, index) {
        const c = strObj.read(index, 1);
        if(c === "" || this.set.has(c)) {
            return {
                success: false,
                length: undefined,
            };
        }
        return {
            success: true,
            length: 1,
        };
    }
}


class UserRepeater extends CoreRepeater {
    constructor(parserGenerator, ...args) {
        if(args.length > 1) {
            args = [UserCoreGroup.getOrCreate(parserGenerator, ...args)];
        }
        super(parserGenerator, ...args);
    }
    static LL = class extends this.superCls {
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
    };
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
    static LL = class extends this.superCls {
        static generateSecondaryParser(bnfAstNode) {
            return UserCoreGroup.LL.generateSecondaryParser.call(bnfAstNode.baseType, bnfAstNode);
        }
    }
}

class FirstOr extends UserOr {
    get selectLogic() {
        return SelectLogic.first;
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
        const escape = this.escape.getOrCreate(this.parserGenerator);
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
        bnfAstNode.assertBaseInstanceOf(this);
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
    static generateEvaluator(astNode) {
        return new Evaluator(astNode);
    }
    static LL = class extends this.superCls {
        static generateSecondaryParser(bnfAstNode) {
            const test = (strObj, index, seed) => bnfAstNode.baseType.terminalTest(strObj, index, bnfAstNode, seed);
            const process = (astNode, strObj, result, seed) => {
                strObj.shift(result.length);
                astNode.length = result.length;
            };
            return AstNode.parserWrapper(bnfAstNode, test, process);
        }
    };
}

class UserEscape extends UserCoreGroup {
    static reuseable = true;
    get escapeChar() {
        return '\\';
    }
    get define() {
        return [CoreTerminal.getOrCreate(this.parserGenerator, this.escapeChar), CoreTerminalDot.getOrCreate(this.parserGenerator)];
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

class AbstractList extends CoreGroup {
    #elemGenerator;
    #option = {};
    constructor(parserGenerator, elemGenerator, {
        separator = ',',
        allowWhite = true,
        allowTrailing = true,
        allowEmpty = true,
    } = {}) {
        super(parserGenerator);
        this.#elemGenerator = elemGenerator;
        this.#option.separator = separator;
        this.#option.allowWhite = allowWhite;
        this.#option.allowTrailing = allowTrailing;
        this.#option.allowEmpty = allowEmpty;
    }
    get Asterisk() {
        return CoreAsterisk;
    }
    get Option() {
        return CoreOption;
    }
    get #separator() {
        if(this.allowWhite) {
            return [
                CoreWhite.getOrCreate(this.parserGenerator, CoreWhite.whiteExcluder),
                CoreTerminal.getOrCreate(this.parserGenerator, this.separator),
                CoreWhite.getOrCreate(this.parserGenerator, CoreWhite.whiteExcluder),
            ];
        }
        return [
            CoreTerminal.getOrCreate(this.parserGenerator, this.separator),
        ];
    }
    get #elem() {
        return [
            this.elemGenerator(this.parserGenerator),
        ];
    }
    get define() {
        const def = [
            ...this.#elem, 
            this.Asterisk.getOrCreate(this.parserGenerator,
                ...this.#separator,
                ...this.#elem,
            ),
        ];
        if(!this.allowEmpty && !this.allowTrailing) {
            return def;
        }
        if(this.allowTrailing) {
            def.push(this.Option.getOrCreate(this.parserGenerator, ...this.#separator));
        }
        if(this.allowEmpty) {
            return [this.Option.getOrCreate(this.parserGenerator, ...def)];
        }
        return def;
    }
    get elemGenerator() {
        return this.#elemGenerator;
    }
    get separator() {
        return this.#option.separator;
    }
    get allowWhite() {
        return this.#option.allowWhite;
    }
    get allowTrailing() {
        return this.#option.allowTrailing;
    }
    get allowEmpty() {
        return this.#option.allowEmpty;
    }
}

class CoreList extends AbstractList {}

class UserList extends AbstractList {
    get Asterisk() {
        return UserAsterisk;
    }
    get Option() {
        return UserOption;
    }
    // Listをユーザー領域（ASTから直接参照されるBNF領域）で使うことはたぶんないので残りの実装は後回し
}

class Parentheses extends UserCoreGroup {
    get bracket() {
        return ['(', ')'];
    }
    get define() {
        return [CoreTerminal.getOrCreate(this.parserGenerator, this.bracket[0]), CoreWhite.getOrCreate(this.parserGenerator), ...this.args, CoreWhite.getOrCreate(this.parserGenerator), CoreTerminal.getOrCreate(this.parserGenerator, this.bracket[1])];
    }
    get isEnclosure() {
        return true;
    }
    static valids() {
        return [2];
    }
}
class Braces extends Parentheses {
    get bracket() {
        return ['{', '}'];
    }
}
class NodeTraitManager {
    #nodeTraitsMap = new Map;
    #nodeTraitsInherited = new Map;
    #knownCls = new Set;
    setTrait(name, setOrObj) {
        this.#scroll(setOrObj, (cls) => {
            if(!this.#nodeTraitsMap.has(cls)) {
                this.#nodeTraitsMap.set(cls, {});
            }
            this.#nodeTraitsMap.get(cls)[name] = true;
        });
    }
    setTraitByInherited(name, setOrObj) {
        this.#scroll(setOrObj, (cls) => {
            if(!this.#nodeTraitsInherited.has(name)) {
                this.#nodeTraitsInherited.set(name, new Set);
            }
            this.#nodeTraitsInherited.get(name).add(cls);
        });
    }
    #scroll(setOrObj, fn) {
        if(setOrObj instanceof Set) {
            const set = setOrObj;
            for(const cls of set) {
                fn(cls);
            }
        } else {
            const obj = setOrObj;
            for(const key in obj) {
                this.#scroll(obj[key], fn);
            }
        }
    }
    nodeTraits(cls) {
        if(!this.#nodeTraitsMap.has(cls)) {
            this.#nodeTraitsMap.set(cls, {});
        }
        const traits = this.#nodeTraitsMap.get(cls);
        if(!this.#knownCls.has(cls)) {
            this.#knownCls.add(cls);
            for(const [flag, clsSet] of this.#nodeTraitsInherited.entries()) {
                for(const superCls of clsSet) {
                    if(cls.isSubClassOf(superCls)) {
                        traits[flag] = true;
                    }
                }
            }
        }
        return traits;
    }
}

class LeafCategorizer extends NodeTraitManager {
    setLeaf(name, setOrObj) {
        this.setTrait(name, setOrObj);
    }
    setLeafByInherited(name, setOrObj) {
        this.setTraitByInherited(name, setOrObj);
    }
    isToken(cls) {
        return this.nodeTraits(cls).token === true;
    }
    isNonTerminal(cls) {
        return this.nodeTraits(cls).nonTerminal === true;
    }
    isLiteral(cls) {
        return this.nodeTraits(cls).literal === true;
    }
}

class ClassCategorizer {
    #traitManager = new NodeTraitManager;
    #leafCategorizer = new LeafCategorizer;
    constructor(categories = {}) {
        if(categories.byConstructor) {
            const category = categories.byConstructor;
            for(const name in category) {
                this.#traitManager.setTrait(name, category[name]);
            }
            if(category.isUserLeaf) {
                for(const name in category.isUserLeaf) {
                    this.#leafCategorizer.setLeaf(name, category.isUserLeaf[name]);
                }
            }
        }
        if(categories.byInherited) {
            const category = categories.byInherited;
            for(const name in category) {
                this.#traitManager.setTraitByInherited(name, category[name]);
            }
            if(category.isUserLeaf) {
                for(const name in category.isUserLeaf) {
                    this.#leafCategorizer.setLeafByInherited(name, category.isUserLeaf[name]);
                }
            }
        }
    }
    get leafCategorizer() {
        return this.#leafCategorizer;
    }
    nodeTraits(cls) {
        return this.#traitManager.nodeTraits(cls);
    }

}

module.exports = {
    SearchOrder,        // 探索の種類
    SelectLogic,        // 構文木作成時の選択ロジックの選択肢
    StringObject,       // 文字列を抽象化して扱うクラス
    BaseAstNode,        // 構文木を作るための基底クラス
    AbstractManager,    // 構文木を管理するクラスの抽象クラス
    Evaluator,          // 構文解析器によって解析された構文木（AstNode）の意味付けを実行するクラス
    AstNode,            // 構文解析器によって生成された構文木の1ノードで，意味実装用のBaseAstNode派生クラス．
    AstManager,         // AstNodeの管理クラス
    BnfAstNode,         // パーサジェネレータによって生成された構文木の1ノードで，構文解析用のBaseAstNode派生クラス．
    BnfAstManager,      // BnfAstNodeの管理クラス（主に依存関係の解決を取り扱う）．構文解析としての選択論理は.selectLogicに従う（デフォルト最長マッチ）
    CoreAstManager,

    CoreAstNode,        // パーサジェネレータを構成する構文木の1ノードで，パーサ生成用のBaseAstNode派生クラス．
    // 以下はCoreAstNodeの派生クラス
    LazyGenerator,      // 再帰が発生する場合に遅延評価するためのクラス
    DummyOperand,       // 必要に応じて後で差し替えられるためのダミークラス（左再帰の解決のために利用）

    // 以下はパーサジェネレータの核部分実装用であり，構文解析器を直接構成しない（CoreはBnfAstNodeまでしか生成しない）
    AbstractGroup,      // ノードを束ねるためのCoreAstNode派生の抽象ノード
    CoreGroup,          // コア部分で使用するノードグループまとめ用のAbstractGroup派生ノード
    CoreNonTerminal,    // コア内で非終端文字として振る舞うCoreGroupの派生クラスとして作ったが，ほぼCoreGroupで足りている．ほぼ名前だけの問題．
    CoreTerminal,       // コア内で終端文字列として振る舞うCoreAstNodeの派生クラス．
    CoreTerminalDot,    // コア内で1文字の終端文字として振る舞うCoreTerminalの派生クラス．
    CoreTerminalSet,    // コア内で終端文字集合として振る舞うCoreTerminalの派生クラス．
    CoreNegTerminalSet, // コア内で終端文字集合の否定として振る舞うCoreTerminalSetの派生クラス．
    CoreWhiteSpace,     // コア内で空白文字を処理するために振る舞うCoreTerminalの派生クラス．
    CoreComment,        // コア内でコメントを処理するために振る舞うCoreTerminalの派生クラス．
    CoreWhite,          // コア内でコメントと空白を一括してとりまとめるためのCoreNonTerminal派生クラス．（現状，CoreNonTerminalの唯一の派生クラス）

    AbstractRepeater,   // 繰り返し処理を記述するときに使用するCoreGroup派生の抽象クラス
    CoreRepeater,       // コア内で繰り返し処理をするときに使用する繰り返しのAbstractRepeaterの派生クラスで，コア繰り返しの基底クラス
    CoreAsterisk,       // コア内で0回以上の繰り返し処理をするときのCoreRepeater派生クラス
    CoreOption,         // コア内で0回または1回出現するときのCoreRepeater派生クラス
    CorePlus,           // コア内で1回以上の繰り返し処理をするときのCoreRepeater派生クラス

    CoreOr,             // コア内での選択ロジックを処理するCoreGroupの派生クラス．選択論理は最長マッチ
    CoreList,           // コア内での要素羅列を抽象化したCoreGroupの派生クラス

    // 以下はパーサジェネレータの表層部分であり，構文解析器からコールされAstNodeを生成する責務を持つ
    UserCoreGroup,      // AstNodeを生成する基本的な実装を組み込んだAbstractGroupの派生クラス．ほとんどのユーザー側ロジックはこれを継承して実装する．
    UserRepeater,       // CoreRepeaterの派生クラスで，繰り返し処理に対応したAstNodeの生成を受け持つ
    UserAsterisk,       // UserRepeaterの派生クラスで，0回以上の繰り返し処理
    UserOption,         // UserRepeaterの派生クラスで，0回または1回
    UserPlus,           // UserRepeaterの派生クラスで，1回以上の繰り返し処理
    UserOr,             // CoreOrの派生クラスで，Or処理に対応したAstNode生成を受け持つ
    FirstOr,            // UserOrの派生クラスで，選択論理がファーストマッチ固定
    UserTerminal,       // UserCoreGroupの派生クラスで，BNF上の終端文字の定義を受け持つ
    UserEscape,         // UserCoreGroupの派生クラスで，UserTerminal内でのエスケープ処理を受け持つ

    UserList,           // AbstractListの派生クラスで，
    Parentheses,
    Braces,

    LeafCategorizer,
};
