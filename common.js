"use strict"
const {NotImplementedError, BaseLayerError, CoreLayerError, BnfLayerError, AstLayerError, RuntimeLayerError, UncategorizedLayerError} = require('./Error.js');

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
    }
    get ErrorLayer() {
        return BaseLayerError;
    }
    static isSuperClassOf(cls) {
        let currentClass = cls;
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
                for(const brother of this.parent.children) {
                    if(brother === this) {
                        return start;
                    }
                    start += brother.length;
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
    static get upperDummyAst() {
        throw new NotImplementedError;
    }
    get upperAst() {
        return new this.constructor.upperAst(this);
    }
    recursive(stopper, process, type = true, depth = 0) {
        if(type) {
            // 深さ優先探索
            const stop = stopper(this);
            if(stop) {
                if(process) {
                    process(stop);
                }
            } else {
                for(const baseAstNode of this.children) {
                    baseAstNode.recursive(stopper, process, type, depth + 1);
                }
            }
        } else {
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
    static isSubClassOf(child, parent) {
        if (typeof child !== 'function' || typeof parent !== 'function') return false;
    
        let proto = child.prototype;
        while (proto) {
            if (proto === parent.prototype) return true;
            proto = Object.getPrototypeOf(proto);
        }
        return false;
    }
    static CompareToken(left, right) {
        return left.constructor === right.constructor;
    }
    static IncrementCacheHit() {
        BaseAstNode.baseCacheHit++;
    }
    static IncrementCacheNouse() {
        BaseAstNode.baseCacheNouse++;
    }
    dig(cls, type = true, min = undefined, max = undefined, error = undefined) {
        const array = [];
        const stopper = baseAstNode => this.constructor.isSubClassOf(baseAstNode.baseType, cls) ? baseAstNode : false;
        const process = baseAstNode => array.push(baseAstNode);
        this.recursive(stopper, process, type);
        if(min !== undefined && max !== undefined) {
            if((array.length < min) || (array.length > max)) {
                throw error || new this.ErrorLayer(`Expected between ${min} and ${max} ${cls.name} in the leaf nodes, but found ${array.length}`, TypeError);
            }
        } else if(min !== undefined) {
            if(array.length < min) {
                throw error || new this.ErrorLayer(`Expected at least ${min} ${cls.name} in the leaf nodes, but found ${array.length}`, TypeError);
            }
        } else if(max !== undefined) {
            if(array.length > max) {
                throw error || new this.ErrorLayer(`Expected at most ${max} ${cls.name} in the leaf nodes, but found ${array.length}`, TypeError);
            }
        }
        return array;
    }
    assertBaseInstanceOf(cls) {
        if(!this.constructor.isSubClassOf(this.baseType, cls)) {
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
        if(!this.constructor.CompareToken(this, baseAstNode)) {
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
    get parentTree() {
        if(this.parent) {
            const arr = this.parent.parentTree;
            arr.push(this);
            return arr;
        } else {
            return [this];
        }
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
        if(!this.constructor.CompareToken(this, newNode)) {
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
}

class AbstractManager {
    #root;
    static dump(roots,  option = {}, prefix = "", isLast = true,) {
        const arrow = option.arrow || ' -> ';
        const omitLength = option.omitLength || 8;
        const shortBefore = option.shortBefore || 3;
        const shortAfter = option.shortAfter || 3;
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
      
        const children = end.children || [];
        const newPrefix = prefix + (isLast ? "    " : "│   ");

        for(const [index, child] of children.entries()) {
            const isLastChild = index === children.length - 1;
            // children.lengthが1な限り，インデント深さを抑えるために横方向に展開する．
            const singleChildChain = this.SingleChildChain(child);
            this.dump(singleChildChain, option, newPrefix, isLastChild);
        }
    }
    static SingleChildChain(node) {
        const chain = [node];
        let currentNode = node;
        while(currentNode.children.length === 1) {
            chain.push(currentNode.children[0]);
            currentNode = currentNode.children[0];
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
    dump(root = this.#root) {
        const chain = AbstractManager.SingleChildChain(root);
        this.constructor.dump(chain);
    }
}

class SelectLogic {
    static get max() {
        return 0;
    }
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
            const args = this.args;
            const evaluate = this.#src.evaluate;
            if(evaluate) {
                return evaluate(args, this.str);
            } else if(args instanceof Object) {
                // evaluatorsに見つからない場合でも，keyが1つならばそれを直接実行（.value）する．
                // （多層構造における自明な意味定義層の省略）
                const keys = Object.keys(args);
                if(keys.length === 1) {
                    return args[keys[0]].value;
                } else {
                    throw new BnfLayerError(`Not implemented for [${this.nameHierarchy}] action.`, NotImplementedError);
                }
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
    get args() {
        if(!(this.#src instanceof AstNode)) {
            return undefined;
        }
        const astNode = this.#src;
        const args = (() => {
            const $ = {};
            let bnf = undefined;
            const record = (t) => {
                const anchor = t.anchor;
                const val = t.evaluator;
                if(val) {
                    val.#anchor = anchor;
                }
                if(t.includedIteration) {
                    if($[anchor] === undefined) {
                        $[anchor] = new Evaluator([]);
                        bnf = t.instance;
                    }
                    if(bnf !== t.instance) {
                        throw new UncategorizedLayerError(`Already assigned ${anchor}`, SyntaxError);
                    }
                    $[anchor].#src.push(val);
                } else {
                    if($[anchor] === undefined) {
                        $[anchor] = val;
                    } else {
                        throw new UncategorizedLayerError(`Already assigned ${anchor}`, SyntaxError);
                    }
                }
            };
            astNode.recursive(
                node => {
                    if(node === astNode) {
                        return false;
                    }
                    if(node.anchor !== null) {
                        record(node);
                    }
                    if(node.depth - astNode.depth > 1) {
                        return true;
                    }
                    return false;
                },
            );
            return $;
        })();
        return args;
    }
    get pos() {
        if(this.#src instanceof AstNode) {
            return this.#src.pos;
        }
    }
    peek(caller, instance) {
        if(this.#src === true || this.#src === false) {
            return this.#src;
        }
        if(this.#src instanceof AstNode) {
            const args = this.args;
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
    #evaluator = null;
    #isBoundary = false;
    #evaluate = undefined;
    static get newDummyNode() {
        return new this(BnfAstNode.newDummyNode);
    }
    dig(cls, type = true, min = undefined, max = undefined, error = undefined) {
        const array = [];
        const stopper = astNode => this.constructor.isSubClassOf(astNode.instance.baseType, cls) ? astNode : false;
        const process = astNode => array.push(astNode);
        this.recursive(stopper, process, type);
        if(min !== undefined && max !== undefined) {
            if((array.length < min) || (array.length > max)) {
                throw error || new this.ErrorLayer(`Expected between ${min} and ${max} ${cls.name} in the leaf nodes, but found ${array.length}`, TypeError);
            }
        } else if(min !== undefined) {
            if(array.length < min) {
                throw error || new this.ErrorLayer(`Expected at least ${min} ${cls.name} in the leaf nodes, but found ${array.length}`, TypeError);
            }
        } else if(max !== undefined) {
            if(array.length > max) {
                throw error || new this.ErrorLayer(`Expected at most ${max} ${cls.name} in the leaf nodes, but found ${array.length}`, TypeError);
            }
        }
        return array;
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
        this.#nameHierarchy = nameHierarchy;
    }
    get nameHierarchy() {
        return this.#nameHierarchy;
    }
    isNameHierarchy(hierarchy) {
        if(this.#nameHierarchy) {
            if(this.#nameHierarchy.length !== hierarchy.length) {
                return false;
            }
            for(const [i, name] of this.#nameHierarchy.entries()) {
                if(name !== hierarchy[i]) {
                    return false;
                }
            }
            return true;
        }
        return false;
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
    get evaluate() {
        if(!this.#evaluate && this.astManager.evaluators.has(this.nameHierarchy)) {
            this.#evaluate = this.astManager.evaluators.get(this.nameHierarchy);
        }
        return this.#evaluate;
    }
    set evaluate(val) {
        return this.#evaluate = val;
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
}

class BnfAstNode extends BaseAstNode {
    #isRecursive = false;
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
    static get upperDummyAst() {
        return AstNode;
    }
    // get upperAst() {
    //     return new AstNode(this);
    // }
    get generateSecondaryParser() {
        return this.baseType.generateSecondaryParser(this);
    }
    get generateSecondaryParserWithout() {
        if(this.baseType.generateSecondaryParserWithout) {
            return this.baseType.generateSecondaryParserWithout(this);
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
}

// BNFの依存関係を解析することがメインタスクのBNF管理クラス
class BnfAstManager extends AbstractManager {
    #BnfClass = {};
    #nameSpace = this.#newSpace('global');
    #parserGenerator = null;
    constructor() {
        super();
    }
    get Cls() {
        return this.#BnfClass;
    }
    set parserGenerator(val) {
        return this.#parserGenerator = val;
    }
    get ruleForger() {
        return this.#parserGenerator.ruleForger;
    }
    get modeDeck() {
        return this.#parserGenerator.modeDeck;
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
        const nonTerminal = NonTerminal.getOrCreate();
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
            if(space.syntaxParser) {
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
    getFullNameStr(nameSpace) {
        const {
            Assign,
            AssignRight,
            AssignLeft,
            NonTerminal,
            RightValue,
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
        return hierarchy.map(space => space.name).join(NonTerminal.selector);
    }
    getSecondaryParser(bnfAstNode) {
        const {
            NonTerminal,
        } = this.Cls;
        bnfAstNode.assertBaseInstanceOf(NonTerminal);
        const space = bnfAstNode.nameSpace || this.#nameSpace;
        const nameHierarchy = bnfAstNode.baseType.nameHierarchy(bnfAstNode);
        const spaces = this.#serializeNameSpace(this.#getNameSpace(nameHierarchy, space));
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
    declare(left, rootSpace = this.#nameSpace) {
        const {
            NonTerminal,
        } = this.Cls;
        const nameHierarchy = left.nameHierarchy;
        const argNames = left.argNames;
        left.dig(NonTerminal, true, 1, 1)[0].nameSpace = rootSpace;
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
    assign(left, right, rootSpace = this.#nameSpace) {
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
                const syntaxParser = AssignRight.generateSecondaryParser(nameSpace.right);
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
                    .map(t => t.dig(NonTerminal, true, 0, 1)[0]).filter(t => t);
                const firstHierarchies = firstTerms.map(t => NonTerminal.nameHierarchy(t));
                const allTerms = AssignRight.getAllTerms(right)
                    .map(t => t.dig(NonTerminal, true, 0, 1)[0]).filter(t => t);
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
            this.root.recursive(stopper, process, 1);
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
            Assign,
            AssignRight,
            AssignLeft,
            NonTerminal,
            RightValue,
        } = this.Cls;
        const nameSpace = target;
        const {right, left, recursiveFirstTerms} = nameSpace;
        const relatedSpaces = this.#getRelatedNameSpaces(nameSpace);
        const relatedCond = relatedSpaces.filter(space => space.hasNonRecursiveTerms);
        if(relatedCond.length === 0) {
            const fullName = this.getFullNameStr(nameSpace);
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
                        parent.node.dig(DummyOperand, true, 1, 1)[0].swap(leaf.node);
                        const nonUserTerminal = leaf.node.parent;
                        nonUserTerminal.nameHierarchy = this.getFullNameStr(leaf.space);
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
    getParser(entryPoint = 'expr') {
        const {
            Assign,
            AssignRight,
            AssignLeft,
            NonTerminal,
            RightValue,
        } = this.Cls;
        this.#resolveLeftRecursionsFrom(entryPoint);
        const systemSpace = this.#newSpace('systemSpace');
        {
            systemSpace.field.set('userSpace', this.#nameSpace);
            const assignRule = new Assign;
            const lstr = "";
            const rstr = "";
            const tmpStrObj = new StringObject("ep = $" + entryPoint);
            const bnfAstNode = assignRule.primaryParser.parse(tmpStrObj).node;
            const [left, right] = Assign.assign(bnfAstNode);
            this.declare(left, systemSpace);
            this.assign(left, right, systemSpace);
            bnfAstNode.setManager(this);
        }
        const field = this.#getNameSpaceByStr("ep", systemSpace);
        const bnfAstNode = field.left.children.find(t => t.baseType === NonTerminal);
        return bnfAstNode.generateSecondaryParser;
    }
}

class CoreAstNode extends BaseAstNode {
    #args;
    #define;
    static genCount = 0;
    constructor(...args) {
        super();
        if(new.target === CoreAstNode) {
            throw new CoreLayerError("abstract class", TypeError);
        }
        this.#args = args;
        for(const arg of this.#args) {
            if(arg instanceof CoreAstNode) {
                arg.parent = this;
            }
        }
    }
    static get newDummyNode() {
        const node = new this;
        return node;
    }
    get ErrorLayer() {
        return CoreLayerError;
    }
    get lexicalAnalyzer() {
        if(this.parent) {
            return this.parent.lexicalAnalyzer;
        }
    }

    static baseType() {
        return this.constructor;
    }
    static CompareToken(left, right) {
        return (left instanceof CoreAstNode) && (right instanceof CoreAstNode);
    }
    // Core, User共通のUtil関数
    lazyReplace(lazyArg, newArg) {
        const opIndex = this.operands.findIndex(op => op === lazyArg);
        if(opIndex > -1) {
            this.operands[opIndex] = newArg;
        }
    }
    static get upperAst() {
        return BnfAstNode;
    }
    static get upperDummyAst() {
        return DummyOperand;
    }
    // get upperAst() {
    //     return new BnfAstNode(this);
    // }
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
    get operands() {
        if(this.#define === undefined) {
            if("define" in this) {
                this.setOperands(this.define);
            } else {
                this.setOperands(this.args);
            }
        }
        return this.children;
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
    static generateSecondaryParser(bnfAstNode) {
        throw new CoreLayerError(this.name + '\'s generateSecondaryParser is not implemented.', NotImplementedError);
    }
    static generateEvaluator(astNode) {
        // 特に指定がないとき，token.childrenからevaluateを得る
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
}

// 再帰する場合に使用する遅延生成器
class LazyGenerator extends CoreAstNode {
    #class = null;
    #args = [];
    constructor(classType, ...args) {
        super();
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
                return (LazyGenerator.getOrCreate(arg)).generateOnDemand();
            }
            return arg;
        });
        const newArg = this.#class.getOrCreate(...args);
        newArg.parent = this.parent;
        return newArg;
    }
    static getSuperClass(cls) {
        let currentClass = cls;
        while (1) {
            const base = Object.getPrototypeOf(currentClass);
            // Function（最上位）またはnullまで来たら終了
            if (!base || base === Function || base === Function.prototype) {
                break;
            }
            currentClass = base;
        }
        return currentClass;
    }
    testBnf(str, index) {
        const newArg = this.generateOnDemand();
        this.parent.lazyReplace(this, newArg);
        return newArg.testBnf(str, index);
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
    constructor(prev, post) {
        super();
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
            Name.getOrCreate(),
            CoreAsterisk.getOrCreate(
                CoreTerminal.getOrCreate(NonTerminal.selector),
                Name.getOrCreate()
            )
        ];
    }
    static generateSecondaryParser(bnfAstNode) {
        throw new CoreLayerError(this.name + '\'s generateSecondaryParser is not implemented.', NotImplementedError);
    }
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
            CoreAsterisk.getOrCreate(CoreOr.getOrCreate(CoreComment.getOrCreate(), CoreWhiteSpace.getOrCreate())),
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
    constructor(...args) {
        super(...args);
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
    static generateSecondaryParser(bnfAstNode) {
        const children = this.valids(bnfAstNode).map(i => bnfAstNode.children[i]);
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
    static generateEvaluator(astNode) {
        if(astNode.children.length === 1) {
            return astNode.children[0].evaluator;
        }
        return new Evaluator(astNode.children.map(child => child.evaluator));
    }
}

class AbstractRepeater extends CoreGroup {
}

// コアとなる構文解析用の繰り返しクラス
class CoreRepeater extends AbstractRepeater {
    #min = 0;
    #max = Infinity;
    #count;
    constructor(...args) {
        if(args.length > 1) {
            // generateSyntaxParserを使うため，CoreGroupではなくUserGroupを使用する．
            args = [UserCoreGroup.getOrCreate(...args)];
        }
        super(...args);
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
    constructor(...args) {
        super(...args);
        this.min = 0;
        this.max = Infinity;
    }
}

class CoreOption extends CoreRepeater {
    constructor(...args) {
        if(args.length > 1) {
            args = [CoreGroup.getOrCreate(...args)];
        }
        super(...args);
        this.min = 0;
        this.max = 1;
    }
}

class CorePlus extends CoreRepeater {
    constructor(...args) {
        super(...args);
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
    constructor(...args) {
        super(...args);
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


module.exports = {
    StringObject,
    BaseAstNode,
    AbstractManager,
    SelectLogic,
    Evaluator,
    AstNode,
    AstManager,
    BnfAstNode,
    BnfAstManager,

    CoreAstNode,
    LazyGenerator,
    DummyOperand,

    AbstractGroup,
    CoreGroup,
    CoreNonTerminal,
    CoreTerminal,
    CoreTerminalDot,
    CoreTerminalSet,
    CoreNegTerminalSet,
    CoreWhiteSpace,
    CoreComment,
    CoreWhite,

    AbstractRepeater,
    CoreRepeater,
    CoreAsterisk,
    CoreOption,
    CorePlus,
    CoreOr,

    UserCoreGroup,
};
