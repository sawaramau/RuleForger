"use strict"
const {ExArray} = require('./Util.js');
const {NotImplementedError, BaseLayerError, CoreLayerError, BnfLayerError, AstLayerError, RuntimeLayerError, UncategorizedLayerError} = require('./Error.js');

class SelectLogic {
    static get max() {
        return 0;
    }
    static get first() {
        return 1;
    }
}

const globalSelectLogic = 0;

class StringObject {
    #ptr;
    #endptr;
    #str;
    #stacks = [];
    constructor(str) {
        this.str = str;
    }
    shift(len = 1) {
        const str = this.#str.substr(this.#ptr, len);
        this.#ptr += str.length;
        return str;
    }
    peek(len = 1) {
        return this.read(this.#ptr, len);
    }
    read(index = this.#ptr, len = 1) {
        if(len > 0) {
            return this.#str.substr(index, len);
        } else {
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
    #string;
    #pos = {};
    #instance;
    #parent = null;
    #children = [];
    #manager = null;
    #baseType = null;
    #anchor = null;
    static #storage = new Map;
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
    set pos(val) {
        this.#pos.column = val?.column;
        this.#pos.line = val?.line;
        return this.#pos;
    }
    get pos() {
        return this.#pos;
    }
    set str(val) {
        return this.#string = val;
    }
    get str() {
        return this.#string;
    }
    get instance() {
        return this.#instance;
    }
    set parent(val) {
        return this.#parent = val;
    }
    get parent() {
        return this.#parent;
    }
    get upperAst() {
        throw new NotImplementedError;
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
    dig(cls, type = true, min = undefined, max = undefined, error = undefined) {
        const array = [];
        const stopper = baseAstNode => this.constructor.isSubClassOf(baseAstNode.baseType, cls) ? baseAstNode : false;
        const process = baseAstNode => array.push(baseAstNode);
        this.recursive(stopper, process, type);
        if(min !== undefined && max !== undefined) {
            if((array.length < min) || (array.length > max)) {
                throw error || new this.ErrorLayer("Expected between " + min + " and " + max + " " + cls.name + " in the leaf nodes, but found " + array.length, TypeError);
            }
        } else if(min !== undefined) {
            if(array.length < min) {
                throw error || new this.ErrorLayer("Expected at least " + min + " " + cls.name + " in the leaf nodes, but found " + array.length, TypeError);
            }
        } else if(max !== undefined) {
            if(array.length > max) {
                throw error || new this.ErrorLayer("Expected at most " + max + " " + cls.name + " in the leaf nodes, but found " + array.length, TypeError);
            }
        }
        return array;
    }
    assertBaseInstanceOf(cls) {
        if(!this.constructor.isSubClassOf(this.baseType, cls)) {
            throw new this.ErrorLayer(this.constructor.name + ": Basetype mismatch: expected " + cls.name + " but received " + this.baseType.name, TypeError);
        }
        return true;
    }
    static getCache(baseAstNode, strObj) {
        if(!this.#storage.has(baseAstNode)) {
            const memory = new Map;
            this.#storage.set(baseAstNode, memory);
        }
        const memory = this.#storage.get(baseAstNode);
        if(!memory.has(strObj)) {
            const cache = new Map;
            memory.set(strObj, cache);
        }
        return memory.get(strObj);
    }
    static parserWrapper(baseAstNode, test, newTokenProcess, failerProcess) {
        const parse = (strObj, seed) => {
            if(baseAstNode.isRecursive && seed) {
                const upperAst = baseAstNode.upperAst;
                // このダミーノードを事前計算済みの子要素と後でswapする．
                upperAst.addChild(this.newDummyNode.upperAst);
                return {
                    node: upperAst,
                };
            }
            const result = test(strObj, strObj.ptr, seed);
            if(!result.success) {
                if(failerProcess) {
                    failerProcess(strObj, result, seed);
                }
                return null;
            }
            const upperAst = baseAstNode.upperAst;
            upperAst.str = strObj.peek(result.length);
            upperAst.pos = strObj.pos();
            if(newTokenProcess) {
                newTokenProcess(upperAst, strObj, result, seed);
            }
            return {
                node: upperAst,
                length: result.length
            };
        };
        return {
            parse,
            test: test,
            process: newTokenProcess,
            failer: failerProcess,
        };
    }
    addChild(baseAstNode) {
        if(!this.constructor.CompareToken(this, baseAstNode)) {
            throw new this.ErrorLayer(`Incompatible instance types: parent is ${this.constructor.name}, child is ${baseAstNode.constructor.name}.`, TypeError);
        }
        baseAstNode.#parent = this;
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
    dump(roots = AbstractManager.SingleChildChain(this.root)) {
        this.constructor.dump(roots);
    }
}

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
            if(this.#src.astManager.evaluators.has(this.nameHierarchy)) {
                return this.#src.astManager.evaluators.get(this.#src.nameHierarchy)(args, this.str);
            }
            if(args instanceof Object) {
                const keys = Object.keys(args);
                if(keys.length === 1) {
                    return args[keys[0]].value;
                } else {
                    throw new BnfLayerError("Not implemented for [" + this.#src.nameHierarchy + "] action.", NotImplementedError);
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
                        throw new UncategorizedLayerError("Already assigned " + anchor, SyntaxError);
                    }
                    $[anchor].#src.push(val);
                } else {
                    if($[anchor] === undefined) {
                        $[anchor] = val;
                    } else {
                        throw new UncategorizedLayerError("Already assigned " + anchor, SyntaxError);
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
}

class AstNode extends BaseAstNode {
    #nameHierarchy = undefined;
    #evaluator = null;
    #isBoundary = false;
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
                throw error || new this.ErrorLayer("Expected between " + min + " and " + max + " " + cls.name + " in the leaf nodes, but found " + array.length, TypeError);
            }
        } else if(min !== undefined) {
            if(array.length < min) {
                throw error || new this.ErrorLayer("Expected at least " + min + " " + cls.name + " in the leaf nodes, but found " + array.length, TypeError);
            }
        } else if(max !== undefined) {
            if(array.length > max) {
                throw error || new this.ErrorLayer("Expected at most " + max + " " + cls.name + " in the leaf nodes, but found " + array.length, TypeError);
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
            return "{{" + "" + label + "}}";
        }
        return label;
    }
    get name() {
        return this.str;
    }
    get astManager() {
        return this.manager;
    }
    addChild(astNode) {
        super.addChild(astNode);
    }
    
}

class AstManager extends AbstractManager {
    #evaluators;
    set evaluators(val) {
        return this.#evaluators = val;
    }
    get evaluators() {
        return this.#evaluators;
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
    get upperAst() {
        return new AstNode(this);
    }
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
}

class BnfAstManager extends AbstractManager {
    #nameSpace = this.newSpace('global');
    #evaluators;
    set evaluators(val) {
        return this.#evaluators = val;
    }
    get evaluators() {
        return this.#evaluators;
    }
    newSpace(name, parent = null) {
        const space = {
            parent: parent,
            name: name,
            syntaxParser: undefined,
            left: undefined,
            right: undefined,
            argNames: undefined,
            field: new Map,
            firstHierarchies: [],
            firstTerms: [],
            recursiveFirstTerms: [],
            allHierarchies: [],
            reverseHierarchies: [],
            hierarchy: undefined,
        };
        Object.defineProperty(space, "hasNonRecursiveTerms", {
            get: () => {
                return space.firstTerms.length !== space.recursiveFirstTerms.length;
            },
            configurable: true,
        });
        return space;
    }
    declare(nameHierarchy, argNames) {
        let currentSpace = this.#nameSpace;
        for(const bnfAstNode of nameHierarchy) {
            const name = bnfAstNode.bnfStr;
            if(!currentSpace.field.has(name)) {
                const newSpace = this.newSpace(name, currentSpace);
                currentSpace.field.set(name, newSpace);
            }
            currentSpace = currentSpace.field.get(name);
        }
        currentSpace.argNames = argNames?.map(bnfAstNode => bnfAstNode.bnfStr);
    }
    static #Str2hierarchy(str) {
        const nonTerminal = new UserNonTerminal();
        const strObj = new StringObject(str);
        const bnfAstNode = nonTerminal.primaryParser.parse(strObj).node;
        return UserNonTerminal.nameHierarchy(bnfAstNode);
    }
    getNameSpace(nameHierarchy) {
        nameHierarchy.map(bnfAstNode => bnfAstNode.assertBaseInstanceOf(Name));
        let currentSpace = this.#nameSpace;
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
                    declared.join(UserNonTerminal.selector) + ' is not declared.',
                    ReferenceError
                );
            }
            currentSpace = currentSpace.field.get(name);
        }
        return currentSpace;
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
    #getRootNameSpace(nameSpace) {
        const hierarchy = [];
        const rec = space => {
            if(space.parent) {
                rec(space.parent);
            }
            hierarchy.push(space);
        };
        rec(nameSpace);
        hierarchy.shift();
        return hierarchy[0];
    }
    static ComparePosition(l, r) {
        if(l.left.pos.line !== r.left.pos.line) {
            return l.left.pos.line - r.left.pos.line;
        }
        return l.left.pos.column - r.left.pos.column;
    }
    #getRelatedNameSpaces(nameSpace) {
        const recursiveSpaces = 
            nameSpace.recursiveFirstTerms.map(term => UserNonTerminal.nameHierarchy(term))
            .map(nameHierarchy => this.getNameSpace(nameHierarchy));
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
        const hierarchy = [];
        const rec = space => {
            if(space.parent) {
                rec(space.parent);
            }
            hierarchy.push(space.name);
        };
        rec(nameSpace);
        hierarchy.shift();
        return hierarchy.join(UserNonTerminal.selector);
    }
    getSyntaxParser(bnfAstNode) {
        bnfAstNode.assertBaseInstanceOf(UserNonTerminal);
        const nameHierarchy = bnfAstNode.baseType.nameHierarchy(bnfAstNode);
        const spaces = this.#serializeNameSpace(this.getNameSpace(nameHierarchy));
        const parsers = spaces.map(space => space.syntaxParser);
        const selectLogic = SelectLogic.max;
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
    assign(left, right) {
        const hierarchy = AssignLeft.nameHierarchy(left);
        const nameSpace = this.getNameSpace(hierarchy);
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
                const syntaxParser = AssignRight.generateSecondaryParser(right);
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
        nameSpace.left = left;
        nameSpace.right = right;
        nameSpace.hierarchy = hierarchy;
    }
    // 左再帰に関して最大のSCC（強連結成分）を検出し，
    // SCCに含まれる要素のうちentryPointから直接到達可能なノードについて
    // 左再帰実行用のWrap処理を追加する．
    leftRecursiveWrap(entryPoint) {
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
                const [left, right] = Assign.assign(bnfAstNode);
                const hierarchy = AssignLeft.nameHierarchy(left);
                // Nullableの場合，左からの無限再帰を止められないため除外する．
                // UserNonTerminalでない要素は終端文字になるが，終端文字では再帰処理が絶対に発生しない．
                // よって，右辺要素の中で最初に現れるNullableでない要素の中から，UserNonTerminal型を抽出する．
                const firstTerms = AssignRight.getMostLeftNotNullableTerms(right)
                    .map(t => t.dig(UserNonTerminal, true, 0, 1)[0]).filter(t => t);
                const firstHierarchies = firstTerms.map(t => UserNonTerminal.nameHierarchy(t));
                const allTerms = AssignRight.getAllTerms(right)
                    .map(t => t.dig(UserNonTerminal, true, 0, 1)[0]).filter(t => t);
                const allHierarchies = (() => {
                    const hierarchies = allTerms.map(t => UserNonTerminal.nameHierarchy(t));
                    const map = new Map;
                    for(const hierarchy of hierarchies) {
                        const hStr = hierarchy.map(t => t.bnfStr).join(UserNonTerminal.selector);
                        map.set(hStr, hierarchy);
                    }
                    return [...map.values()];
                })();
                map.set(hierarchy, [firstHierarchies, allHierarchies, firstTerms]);
            };
            this.root.recursive(stopper, process, 1);
            for(const [hierarchy, [firstHierarchies, allHierarchies, firstTerms]] of map) {
                const nameSpace = this.getNameSpace(hierarchy);
                nameSpace.firstHierarchies = firstHierarchies;
                nameSpace.firstTerms = firstTerms;
                nameSpace.allHierarchies = allHierarchies;
                for(const revHierarchy of allHierarchies) {
                    const s = this.getNameSpace(revHierarchy);
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
                        const hierarchy = UserNonTerminal.nameHierarchy(term);
                        const spaces = new Set(this.#serializeNameSpace(this.getNameSpace(hierarchy)));
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
                    const children = hierarchies.map(h => this.getNameSpace(h))
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
        const wrapTargets = [];
        {
            const getChildren = nameSpace => {
                const hierarchies = nameSpace.reverseHierarchies;
                const children = hierarchies.map(h => this.getNameSpace(h))
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
                        wrapTargets.push(nameSpace);
                    }
                }
            }
        }
        // wrapTargetsのsyntaxParserに左再帰対策のWrapを施す．
        {
            for(const nameSpace of wrapTargets) {
                this.#wrapLeftRecursive(nameSpace);
            }
        }
    }
    #wrapLeftRecursive(target) {
        const nameSpace = target;
        const {right, left, recursiveFirstTerms} = nameSpace;
        const relatedSpaces = this.#getRelatedNameSpaces(nameSpace);
        const relatedCond = relatedSpaces.filter(space => space.hasNonRecursiveTerms);
        if(relatedCond.length === 0) {
            const fullName = this.getFullNameStr(nameSpace);
            throw new BnfLayerError("Left-recursive rule requires at least one base (non-recursive) case to terminate. " +
                "(Line:" + nameSpace.left.pos.line + " Column:" + nameSpace.left.pos.column + " " +
                fullName + ")", TypeError);
        }
        const recSet = new Set(recursiveFirstTerms);
        const ownRightValues = right.dig(RightValue);
        const recursiveRVs = ownRightValues.filter(node => {
            const set = new Set(node.dig(UserNonTerminal));
            return set.intersection(recSet).size;
        });
        const nonRecursiveRVs = ownRightValues.filter(node => {
            const set = new Set(node.dig(UserNonTerminal));
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
                    const cache = BaseAstNode.getCache(left, strObj);
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
                    const cache = BaseAstNode.getCache(left, strObj);
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
                        const oldStr = parent.node.str;
                        parent.node.str = strObj.read(seed.start, seed.length);
                        parent.node.pos = strObj.pos(seed.start);
                        parent.node.dig(DummyOperand, true, 1, 1)[0].swap(leaf.node);
                        const nonUserTerminal = leaf.node.parent;
                        nonUserTerminal.str = parent.node.str;
                        nonUserTerminal.pos = parent.node.pos;
                        nonUserTerminal.nameHierarchy = this.getFullNameStr(leaf.space);
                        // 子要素に正しいラベルを伝える．
                        parent.node.recursive((astChildNode) => {
                            if(astChildNode.children.length > 1) {
                                // TODO:
                                // この方法だとデフォルト値で分岐した場合に全く対応できない．
                                // return true;
                            }
                            if(astChildNode.str === oldStr) {
                                // TODO:この方法で伝搬させると，
                                // デフォルト値のように生値に影響されない子要素の文字列を書き換える恐れがある．
                                // posと合わせて確認したとしても本質的にその問題は解消されない．
                                astChildNode.str = parent.node.str;
                                astChildNode.pos = parent.node.pos;
                            }
                    });
                        // 本当は親要素にも伝えたほうがいいと思うけれど，
                        // 親要素を使ってラベルを取り出す機会は今のところないのでスルー．
                        leaf = parent;
                    }
                    return leaf;
                };
                return {test, parse};
            },
            configurable: true,
        })
        const parser = (accessor, selectLogic = SelectLogic.max) => {
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
    #getNameSpaceByStr(entryPoint) {
        const ep = BnfAstManager.#Str2hierarchy(entryPoint);
        const field = (() => {
            try {
                return this.getNameSpace(ep);
            } catch(e) {
                throw new BnfLayerError("Entrypoint:" + entryPoint + " is not declared.", ReferenceError);
            }
        })();
        return field;
    }
    generateExecuter(strObj, entryPoint = 'expr') {
        const field = this.#getNameSpaceByStr(entryPoint);
        const bnfAstNode = field.left.children.find(t => t.baseType === UserNonTerminal);
        return bnfAstNode.generateSecondaryParser.parse(strObj).node;
    }
}

class CoreAstNode extends BaseAstNode {
    #args;
    #define;
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
    get upperAst() {
        return new BnfAstNode(this);
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
    }
    testBnf(strObj, index) {
        throw new CoreLayerError("Method testBnf must be implemented in subclass of " + this.constructor.name, NotImplementedError);
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
}

class DummyOperand extends CoreAstNode {
}

// ORで再帰する場合に使用する遅延生成器
class LazyGenerate extends CoreAstNode {
    #class = null;
    #args = [];
    constructor(classType, ...args) {
        super();
        this.#class = classType;
        for(const arg of args) {
            this.#args.push(arg);
        }
    }
    generate() {
        const args = this.#args.map(arg => {
            if(arg instanceof LazyGenerate) {
                return arg.generate();
            }
            if(CoreAstNode.isSuperClassOf(arg)) {
                return (new LazyGenerate(arg)).generate();
            }
            return arg;
        });
        const newArg = new this.#class(...args);
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
        const newArg = this.generate();
        this.parent.lazyReplace(this, newArg);
        return newArg.testBnf(str, index);
    }
}

class CoreTerminal extends CoreAstNode {
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
            new Name,
            new CoreAsterisk(
                new CoreTerminal(UserNonTerminal.selector),
                new Name
            )
        ];
    }
    static generateSecondaryParser(bnfAstNode) {
        throw new CoreLayerError(this.name + '\'s generateSecondaryParser is not implemented.', NotImplementedError);
    }
}

class CoreEntryPoint extends CoreNonTerminal {
    get define() {
        return [new CoreAsterisk(new CoreExpr)];
    }
}

class CoreExpr extends CoreNonTerminal {
    get define() {
        return [
            new CoreOr(
                new Assign, 
                new CoreOr(
                    new CoreTerminal(';'), 
                    new CoreTerminal('\n')
                ), 
                new CoreWhite
            )
        ];
    }
}

class CoreWhite extends CoreNonTerminal {
    get define() {
        return [
            new CoreAsterisk(new CoreOr(new CoreComment, new CoreWhiteSpace)),
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

class CoreTerminalDot extends CoreTerminal {
    testBnf(strObj, index) {
        const c = strObj.read(index, 1);
        this.str = c;
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
            this.str = undefined;
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

class UserGroup extends AbstractGroup {
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

class Assign extends UserGroup {
    get define() {
        return [
            new AssignLeft, new CoreWhite, new CoreTerminal('='), 
            new CoreWhite, new AssignRight, new CoreWhite, 
        ];
    }
    static assign(bnfAstNode) {
        bnfAstNode.assertBaseInstanceOf(this);
        const left = bnfAstNode.children.find(t => t.baseType === AssignLeft);
        const right = bnfAstNode.children.find(t => t.baseType === AssignRight);
        return [left, right];
    }
}

class AssignLeft extends UserGroup {
    get define() {
        return [
            new CoreWhite,
            new UserNonTerminal, 
            new CoreWhite,
            new CoreOption (
                new Parentheses(
                    new CoreAsterisk(new CoreWhite, new Variable, new CoreWhite, new CoreTerminal(',')), 
                    new CoreWhite, new CoreOption(new Variable),
                    new CoreWhite,
                )
            ),
            new CoreWhite,
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

class AssignRight extends UserGroup {
    get define() {
        return [
            new BnfOr(RightValue, '|')
        ];
    }
    static getMostLeftNotNullableTerms(bnfAstNode) {
        const result = [];
        bnfAstNode.assertBaseInstanceOf(this);
        const or = bnfAstNode.children[0];
        const orCls = or.baseType;
        if(!orCls.candidates) {
            throw new CoreLayerError("Static method " + orCls.name + ".candicates(bnfAstNode) does not exist.", NotImplementedError);
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
            throw new CoreLayerError("Static method " + orCls.name + ".candicates(bnfAstNode) does not exist.", NotImplementedError);
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

class RightValue extends UserGroup {
    get define() {
        return [
            new CoreOption(new VariableDefault),
            new UserPlus(
                new MonoTerm,
                new CoreWhite(CoreWhite.whiteExcluder),
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
            search(child);
        }
        return result;
    }
}

class MonoTerm extends UserGroup {
    static get lastTermCls() {
        return MyNegOperate;
    }
    get define() {
        return [
            new UserOr(
                new MonoTerm.lastTermCls,
                new Renamer(MonoTerm.lastTermCls),
            )
        ];
    }
}

class RightElement extends UserGroup {
    get define() {
        return [
                new CoreWhite(CoreWhite.whiteExcluder),
                new UserOr(
                    new UserNonTerminal,
                    new UserTerminals,
                    // AssignRight は再帰なので，遅延生成とする
                    new LazyGenerate(Parentheses, AssignRight),
                ),
                new CoreWhite(CoreWhite.whiteExcluder),
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

class Name extends UserGroup {
    get define() {
        const az = "abcdefghijklmnopqrstuvwxyz";
        const AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const digit = "0123456789";
        const symbol = "_"
        return [
            new CoreTerminalSet(symbol, az, AZ), new CoreAsterisk(new CoreTerminalSet(symbol, az, AZ, digit))
        ];
    }
}

class VarName extends Name {
}

class Parentheses extends UserGroup {
    get define() {
        return [new CoreTerminal('('), new CoreWhite, ...this.args, new CoreWhite, new CoreTerminal(')')];
    }
    get isEnclosure() {
        return true;
    }
    static valids() {
        return [2];
    }
}

class UserNonTerminal extends UserGroup {
    get define() {
        return [
            new Name, 
            new CoreAsterisk(new CoreWhite, new CoreTerminal(UserNonTerminal.selector), new CoreWhite, new Name)
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
        const parser = bnfAstNode.bnfAstManager.getSyntaxParser(bnfAstNode);
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
        return BnfAstNode.parserWrapper(bnfAstNode, test, process);
    }
    static generateEvaluator(astNode) {
        return new Evaluator(astNode);
    }
}

class Renamer extends UserGroup {
    get define() {
        return [
            new CoreTerminal('$'), 
            new CoreOption(new VarName, new CoreWhite, new CoreTerminal(':'), new CoreWhite),
            new this.args[0]
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

class Variable extends UserGroup {
    get define() {
        return [new CoreTerminal('$'), new VarName]
    }
    static getAnchor(bnfAstNode) {
        if(bnfAstNode.children) {
            return bnfAstNode.children[1].bnfStr;
        }
        return undefined;
    }
}

class VariableDefault extends UserGroup {
    get define() {
        return [
            new CoreTerminal('{'), new CoreWhite, 
            new CoreAsterisk(new DefaultValue, new CoreWhite, new CoreTerminal(','), new CoreWhite),
            new CoreOption(new DefaultValue, new CoreWhite), 
            new CoreTerminal('}'), new CoreWhite, 
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

class DefaultValue extends UserGroup {
    get define() {
        return [
            new CoreTerminal('$'), 
            new CoreOption(new VarName, new CoreWhite, new CoreTerminal(':'), new CoreWhite), 
            new UserNonTerminal, new CoreWhite, new CoreTerminal('('), new CoreWhite, 
            new CoreTerminal('`'),
            new CoreAsterisk(
                new CoreOr(
                    new CoreNegTerminalSet('`\\'), 
                    new CoreGroup(new CoreTerminal('\\'), new CoreTerminalDot)
                )
            ),
            new CoreTerminal('`'), new CoreWhite, 
            new CoreWhite, new CoreTerminal(')'),
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

class MyNegOperate extends UserGroup {
    get define() {
        return [
            new UserOr(
                new MyRepeaterSet,
                new UserGroup(new CoreTerminal('!'), new MyRepeaterSet)
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

class MyRepeaterSet extends UserGroup {
    get define() {
        return [
            new UserOr(
                new RightElement,
                new MyAsterisk(RightElement),
                new MyPlus(RightElement),
                new MyOption(RightElement),
            )
        ];
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
            args = [new UserGroup(...args)];
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
            args = [new CoreGroup(...args)];
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

class UserRepeater extends CoreRepeater {
    static generateSecondaryParser(bnfAstNode) {
        if(bnfAstNode.instance.args[0]?.constructor === UserGroup) {
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
            args = [new CoreGroup(...args)];
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
                if(count >= bnfAstNode.instance.max) {
                    break;
                }
            }
            if(count >= bnfAstNode.instance.min) {
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
}

class MyAsterisk extends MyRepeater {
    get define() {
        return [
            new this.elemType, new CoreTerminal('*')
        ];
    }
    get min() {
        return 0;
    }
    get max() {
        return Infinity;
    }
}

class MyPlus extends MyRepeater {
    get define() {
        return [
            new this.elemType, new CoreTerminal('+')
        ];
    }
    get min() {
        return 1;
    }
    get max() {
        return Infinity;
    }
}

class MyOption extends MyRepeater {
    get define() {
        return [
            new this.elemType, new CoreTerminal('?')
        ];
    }
    get min() {
        return 0;
    }
    get max() {
        return 1;
    }
}

class CoreOr extends CoreGroup {
    #hitter = null;
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

class UserOr extends CoreOr {
    static valids(bnfAstNode) {
        // Or要素がbnfTokensとして返す要素は1つだけなので，有効な要素のインデックスは必ず0
        return [0];
    }
    static generateSecondaryParser(bnfAstNode) {
        return UserGroup.generateSecondaryParser.call(this, bnfAstNode);
    }
}

class BnfOr extends UserGroup {
    get candidate() {
        return this.args[0];
    }
    get selectLogic() {
        return SelectLogic.max;
    }
    get operator() {
        return this.args[1];
    }
    get define() {
        return [
            new this.candidate,
            new CoreWhite(CoreWhite.whiteExcluder),
            new CoreAsterisk(
                new CoreWhite,
                new CoreTerminal(this.operator),
                new CoreWhite,
                new this.candidate, 
                new CoreWhite(CoreWhite.whiteExcluder),
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
                        if(this.selectLogic === SelectLogic.first) {
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
    get selectLogic() {
        return SelectLogic.first;
    }
}

class UserTerminals extends UserGroup {
    get define() {
        return [
            new UserOr(
                new UserTerminal,
                new NoCaseTerminal,
                new MyTerminalSet,
            )
        ];
    }
    static valids() {
        return [0]
    }
}

class UserTerminal extends UserGroup {
    get bracket() {
        return ['"', '"'];
    }
    get escape() {
        return UserEscape;
    }
    get define() {
        const escape = new this.escape;
        return [
            new CoreTerminal(this.bracket[0]), 
            new CoreAsterisk(new CoreOr(new CoreNegTerminalSet(this.bracket[1], escape.escapeChar), escape)), 
            new CoreTerminal(this.bracket[1]),
        ];
    }
    static targetString(bnfAstNode) {
        // エスケープ文字を処理するならこの内容を修正する．
        return bnfAstNode.children[1].bnfStr;
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

class UserEscape extends UserGroup {
    get escapeChar() {
        return '\\';
    }
    get define() {
        return [new CoreTerminal(this.escapeChar), new CoreTerminalDot];
    }
}

class ParserGenerator {
    #entryPoint = new CoreEntryPoint;
    #evaluators;
    #bnfAstManager;
    #astManager;
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
        const seriarizedMap = new Map;
        for(const [hierarchy, action] of map.entries()) {
            const nameHierarchy = hierarchy instanceof Array ? hierarchy.join(UserNonTerminal.selector) : hierarchy;
            seriarizedMap.set(nameHierarchy, action);
        }
        this.#evaluators = seriarizedMap;
        return seriarizedMap;
    }
    analyze(str) {
        const strObj = new StringObject(str);
        this.#bnfAstManager = new BnfAstManager;
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
            const hierarchy = AssignLeft.nameHierarchy(bnfAstNode);
            const argNames = AssignLeft.argNames(bnfAstNode);
            this.#bnfAstManager.declare(hierarchy, argNames);
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
    
    parse(str, entryPoint = 'expr') {
        const strObj = new StringObject(str);
        this.#astManager = new AstManager;
        this.#bnfAstManager.leftRecursiveWrap(entryPoint);
        this.#bnfAstManager.evaluators = this.#evaluators;
        this.#astManager.evaluators = this.#evaluators;
        this.#astManager.root = this.#bnfAstManager.generateExecuter(strObj, entryPoint);
        return {
            executer: this.#astManager.root.evaluator,
            abstractSyntaxTree: this.#astManager.root,
        };
    }
    get bnfStr() {
        return this.#bnfAstManager.root.bnfStr;
    }
    dumpBnfAST() {
        this.#bnfAstManager.dump();
    }
    dumpAST() {
        this.#astManager.dump();
    }
}

class RuleForger {
    #parserGenerator;
    #program;
    #entryPoint = 'expr';
    #evaluators;
    set bnf(bnf) {
        this.#parserGenerator = new ParserGenerator;
        if(this.#evaluators) {
            this.#parserGenerator.evaluators = this.#evaluators;
        }
        return this.#parserGenerator.analyze(bnf);
    }
    set evaluators(val) {
        this.#evaluators = val;
        if(this.#parserGenerator) {
            this.#parserGenerator.evaluators = this.#evaluators;
        }
        return this.#evaluators;
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
    parse(program = this.#program, entryPoint = this.#entryPoint) {
        if(program === undefined) {
            throw new RuntimeLayerError("No input provided for parsing.", Error);
        }
        if(entryPoint === undefined) {
            throw new RuntimeLayerError("Undefined grammar rule.", Error);
        }
        if(!this.#parserGenerator) {
            throw new RuntimeLayerError("Parsing failed: no BNF grammar has been defined.", Error);
        }
        return this.#parserGenerator.parse(program, entryPoint);
    }
    dumpProgramAST(program, entryPoint = this.#entryPoint) {
        if(program) {
            this.parse(program, entryPoint).parse();
        }
        this.#parserGenerator.dumpAST();
    }
    dumpBnfAST() {
        if(!this.#parserGenerator) {
            throw new RuntimeLayerError("Parsing failed: no BNF grammar has been defined.", Error);
        }
        this.#parserGenerator.dumpBnfAST();
    }
}

module.exports = {
    RuleForger,
    AstManager,
    Evaluator,
};
