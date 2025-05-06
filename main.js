"use strict"
const {ExArray} = require('./Util.js');
const {NotImplementedError, LayerError, CoreLayerError, BnfLayerError, AstLayerError, RuntimeLayerError, UncategorizedLayerError} = require('./Error.js');

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
    static #storage = new Map;
    constructor(instance) {
        this.#instance = instance;
        this.#baseType = this.constructor.baseType(instance);
    }
    get ErrorLayer() {
        return LayerError;
    }
    static isSuperClassOf(cls) {
        let current = cls;
        while (1) {
            if(this === current) {
                return true;
            }
            const base = Object.getPrototypeOf(current);
            // Function（最上位）またはnullまで来たら終了
            if (!base || base === Function || base === Function.prototype) {
                break;
            }
            current = base;
        }
        return false;
    }
    static baseType(instance) {
        return instance.constructor;
    }
    get baseType() {
        return this.#baseType;
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
                const current = queue.shift();
                const stop = stopper(current);
                if(stop) {
                    if(process) {
                        process(stop);
                    }
                    continue;
                }
                for(const t of current.children) {
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
        const stopper = bnfAstNode => this.constructor.isSubClassOf(bnfAstNode.baseType, cls) ? bnfAstNode : false;
        const process = bnfAstNode => array.push(bnfAstNode);
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
    static parserWrapper(lowerAst, test, newTokenProcess) {
        const newTest = (strObj, index) => {
            const cache = BaseAstNode.getCache(lowerAst, strObj);
            if(cache.has(index)) {
                const history = cache.get(index);
                if(history.inProgress) {
                    return history.result;
                } else {
                    console.log(history);
                    return history.result;
                }
            }
            const result = test(strObj, index);
            return result;
        };
        const parse = strObj => {
            const result = test(strObj, strObj.ptr);
            if(!result.success) {
                return null;
            }
            const baseAstNode = lowerAst.upperAst;
            baseAstNode.str = strObj.peek(result.length);
            baseAstNode.pos = strObj.pos();
            if(newTokenProcess) {
                newTokenProcess(baseAstNode, strObj, result);
            }
            return {
                node: baseAstNode,
                length: result.length
            };
        };
        return {
            parse,
            test: newTest,
            process: newTokenProcess,
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
}

class AbstractManager {
    #root;
    static dump(roots, prefix = "", isLast = true) {
        const connector = isLast ? "└── " : "├── ";
        const arrow = ' -> ';
        const end = roots.slice(-1)[0];
        const fullLabels = roots.map(root => root.label);
        const labels = fullLabels.filter((l, i) => l !== fullLabels[i - 1]);
        const skips = fullLabels.map((l, i) => [l, i]).filter((li => li[0] !== fullLabels[li[1] - 1])).map(li => li[1]);
        const label = '[' + end.name + '] ' + (() => {
            if(labels.length > 8) {
                return labels.slice(0, 3).concat(['...']).concat(labels.slice(-3)).join(arrow) 
                       + ' (depth:' + labels.length + ')';
            }
            return labels.join(arrow);
        })();
        console.log(prefix + connector + label);
      
        const children = end.children || [];
        const newPrefix = prefix + (isLast ? "    " : "│   ");

        for(const [index, child] of children.entries()) {
            const isLastChild = index === children.length - 1;
            const childTree = (() => {
                const newRoots = [child];
                let current = child;
                // children.lengthが1のとき，インデント深さを抑えるために横方向にのみ展開する．
                while(current.children.length === 1) {
                    newRoots.push(current.children[0]);
                    current = current.children[0];
                }
                return newRoots;
            })();
            this.dump(childTree, newPrefix, isLastChild);
        }
    }
    get root() {
        return this.#root;
    }
    set root(baseAstNode) {
        baseAstNode.setManager(this);
        baseAstNode.assertUniqueTokens();
        return this.#root = baseAstNode;
    }
    dump(roots = [this.root]) {
        this.constructor.dump(roots);
    }
}

class Evaluator {
    #src;
    #anchor = null;
    #type;
    #args;
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
    get value() {
        if(this.#src === true || this.#src === false) {
            return this.#src;
        }
        if(this.#src instanceof AstNode) {
            if(this.#src.astManager.evaluators.has(this.#src.nameHierarchy)) {
                return this.#src.astManager.evaluators.get(this.#src.nameHierarchy)(this.args);
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
                t => {
                    if(t.anchor !== null) {
                        record(t);
                    }
                    if(t.instance.baseType === UserNonTerminal) {
                        return t !== astNode;
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
    #anchor;
    #nameHierarchy = undefined;
    #evaluator = null;
    constructor(instance) {
        super(instance);
        this.#anchor = instance.anchor;
    }
    get ErrorLayer() {
        return AstLayerError;
    }
    get evaluator() {
        if(this.#evaluator === null) {
            this.#evaluator = this.instance.instance.constructor.generateEvaluator(this);
        }
        return this.#evaluator;
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
    get anchor() {
        return this.#anchor;
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
        return this.instance.bnfStr;
    }
    get name() {
        return this.str;
    }
    get astManager() {
        return this.manager;
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
    #anchor = null;
    constructor(instance) {
        super(instance);
    }
    get ErrorLayer() {
        return BnfLayerError;
    }
    setAnchor(name) {
        return this.#anchor = name;
    }
    getAnchorName() {
        return this.baseType.getAnchor(this);
    }
    get anchor() {
        return this.#anchor;
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
        return {
            parent: parent,
            name: name,
            lexicalParser: undefined,
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
    }
    declare(nameHierarchy, argNames) {
        let current = this.#nameSpace;
        for(const bnfAstNode of nameHierarchy) {
            const name = bnfAstNode.bnfStr;
            if(!current.field.has(name)) {
                const newSpace = this.newSpace(name, current);
                current.field.set(name, newSpace);
            }
            current = current.field.get(name);
        }
        current.argNames = argNames?.map(bnfAstNode => bnfAstNode.bnfStr);
    }
    static #Str2hierarchy(str) {
        const nonTerminal = new UserNonTerminal();
        const strObj = new StringObject(str);
        const bnfAstNode = nonTerminal.primaryParser.parse(strObj).node;
        return UserNonTerminal.nameHierarchy(bnfAstNode);
    }
    getNameSpace(nameHierarchy) {
        nameHierarchy.map(bnfAstNode => bnfAstNode.assertBaseInstanceOf(Name));
        let current = this.#nameSpace;
        const declared = [];
        for(const bnfAstNode of nameHierarchy) {
            const name = bnfAstNode.bnfStr;
            declared.push(name);
            if(!current.field.has(name)) {
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
            current = current.field.get(name);
        }
        return current;
    }
    #serializeNameSpace(nameSpace) {
        const spaces = [];
        const getParsers = space => {
            if(space.lexicalParser) {
                spaces.push(space);
            }
            for(const [key, val] of space.field) {
                getParsers(val);
            }
        };
        getParsers(nameSpace);
        return spaces;
    }
    getLexicalParser(bnfAstNode) {
        bnfAstNode.assertBaseInstanceOf(UserNonTerminal);
        const nameHierarchy = bnfAstNode.baseType.nameHierarchy(bnfAstNode);
        const spaces = this.#serializeNameSpace(this.getNameSpace(nameHierarchy));
        const parsers = spaces.map(space => space.lexicalParser);
        const test = (strObj, index) => {
            const lens = parsers.map(parser => parser.test(strObj, index));
            const max = (() => {
                let max = {
                    success: false,
                    length: undefined,
                    candidate: undefined,
                    result: undefined,
                };
                for(const [i, len] of lens.entries()) {
                    if(!len.success) {
                        continue
                    }
                    if((max.length === undefined) || (max.length < len.length)) {
                        max.success = true;
                        max.length = len.length;
                        max.candidate = i;
                        max.result = len;
                    }
                }
                return max;
            })();
            return max;
            
        };
        const process = (astNode, strObj, result) => {
            const fullNameHierarchy = (() => {
                const hierarchy = [];
                const rec = space => {
                    if(space.parent) {
                        rec(space.parent);
                    }
                    hierarchy.push(space.name);
                };
                rec(spaces[result.candidate]);
                hierarchy.shift();
                return hierarchy;
            })();
            astNode.nameHierarchy = fullNameHierarchy.join(UserNonTerminal.selector);
            const child = parsers[result.candidate].parse(strObj);
            astNode.addChild(child.node);
        };
        return AstNode.parserWrapper(bnfAstNode, test, process);
    }
    assign(left, right) {
        const hierarchy = AssignLeft.nameHierarchy(left);
        const nameSpace = this.getNameSpace(hierarchy);
        Object.defineProperty(nameSpace, "lexicalParser", {
            get: () => {
                // assign時点では左再帰未対策のため，getterにて登録する．
                const lexicalParser = AssignRight.generateSecondaryParser(right);
                return lexicalParser;
            }
        })
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
        // wrapTargetsのlexicalParserに左再帰対策のWrapを施す．
        {
            for(const nameSpace of wrapTargets) {
                // console.log(nameSpace.hierarchy.map(t => t.bnfStr));
                const {right, recursiveFirstTerms} = nameSpace;
                // const firstTermsAsRV = recursiveFirstTerms.map(t => t.parentTree.reverse().find(t => t.baseType === RightValue));
                const cacheSet = (strObj, index, history) => {
                    for(const rv of recursiveFirstTerms) {
                        const cache = BaseAstNode.getCache(rv, strObj);
                        if(!cache.has(index)) {
                            cache.set(index, history);
                            continue;
                        }
                        const prev = cache.get(index);
                        if(prev.inProgress) {
                            cache.set(index, history);
                        } else {
                            // progressingでないならばその実行履歴は変更されない．
                        }
                    }
                };
                Object.defineProperty(nameSpace, "lexicalParser", {
                    get: () => {
                        const lexicalParser = AssignRight.generateSecondaryParser(right);
                        const newTest = (strObj, index) => {
                            // BnfAstManagerから直接変更をかけられるのは非終端文字の左辺まで．
                            // 実際に再帰を起こす右辺側の要素の改変はWrapperにて行う．
                            cacheSet(strObj, index, {inProgress: true, result: {success: false}})
                            let prev = lexicalParser.test(strObj, index);
                            if(!prev.success) {
                                cacheSet(strObj, index, {inProgress: false, result: {success: false}});
                                return lexicalParser.test(strObj, index);
                            }
                            let length = 0;
                            while(1) {
                                cacheSet(strObj, index + length, {inProgress: true, result: {success: true, length: prev.length}});
                                cacheSet(strObj, index + length + prev.length, {inProgress: true, result: {success: false}});
                                const result = lexicalParser.test(strObj, index);
                                if((!result.success) || (prev.length >= result.length)) {
                                    cacheSet(strObj, index + length, {inProgress: false, result: {success: false}});
                                    break;
                                }
                                cacheSet(strObj, index + length, {inProgress: false, result: {success: true, length: prev.length}});
                                prev = result;
                                length += prev.length;
                            }
                            return lexicalParser.test(strObj, index);
                        };
                        const {process, parse} = lexicalParser;
                        return {process, parse, test: newTest};
                    }
                })
            }
        }
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
        const process = (bnfAstNode, strObj, result) => {
            operand.parseBnfProcess(bnfAstNode, strObj, result);
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
    // generateLexicalParserは get bnfAstNode で生成したBNFについて，
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
        let current = cls;
        while (1) {
            const base = Object.getPrototypeOf(current);
            // Function（最上位）またはnullまで来たら終了
            if (!base || base === Function || base === Function.prototype) {
                break;
            }
            current = base;
        }
        return current;
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
    parseBnfProcess(bnfAstNode, strObj, result) {
        const operands = this.operands;
        for(const op of operands) {
            const child = op.primaryParser.parse(strObj);
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
        const test = (strObj, index) => {
            let length = 0;
            for(const [i, parser] of parsers.entries()) {
                const result = parser.test(strObj, index);
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
        const process = (astNode, strObj, result) => {
            for(const parser of parsers) {
                const child = parser.parse(strObj);
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
            new MyOr(RightValue, '|')
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
        const process = (astNode, strObj, result) => {
            const child = parser.parse(strObj);
            astNode.addChild(child.node);
            // デフォルト値を与えるトークンを生やす
            if(opt.count) {
                const variables = VariableDefault.getDefaults(opt.children[0]);
                for(const variable of variables) {
                    const {anchor, strObj, nonTerminal} = variable;
                    nonTerminal.setAnchor(anchor);
                    const result = nonTerminal.generateSecondaryParser.test(strObj, 0);
                    if(!result.success) {
                        throw new BnfLayerError("Default value define おかしい", SyntaxError);
                    }
                    const child = nonTerminal.generateSecondaryParser.parse(strObj);
                    console.log(child);
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
        // search(first);
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
        const parser = bnfAstNode.bnfAstManager.getLexicalParser(bnfAstNode);
        return parser;
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
        if(anchor !== null) {
            bnfAstNode.children[this.#reference].setAnchor(anchor);
        }
        return parser;
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
            const bnfAstNode = child.dig(DefaultValue, 1, 1, 1)[0];//child.children.find(c => c.baseType === DefaultValue);
            const defaultVal = DefaultValue.getDefault(bnfAstNode);
            defaults.push(defaultVal);
        }
        {
            const bnfAstNode = opt.dig(DefaultValue, 1, 1, 1)[0];
            //opt.children.find(c => c.baseType === DefaultValue);
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
            const test = (strObj, index) => {
                const result = parser.test(strObj, index);
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
            // generateLexicalParserを使うため，CoreGroupではなくUserGroupを使用する．
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
    parseBnfProcess(bnfAstNode, strObj, result) {
        for(let i = 0; i < result.count; i++) {
            const child = this.Src.primaryParser.parse(strObj);
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
        const test = (strObj, index) => {
            let length = 0;
            for(const bnfAstChild of bnfAstNode.children) {
                const result = bnfAstChild.generateSecondaryParser.test(strObj, index + length);
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
        const process = (astNode, strObj, result) => {
            for(const bnfAstChild of bnfAstNode.children) {
                const child = bnfAstChild.generateSecondaryParser.parse(strObj);
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
        const test = (strObj, index) => {
            let length = 0;
            let count = 0;
            while(1) {
                const result = parser.test(strObj, index + length);
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
        const process = (astNode, strObj, result) => {
            for(let i = 0; i < result.count; i++) {
                const child = parser.parse(strObj);
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
    parseBnfProcess(bnfAstNode, strObj, result) {
        const hitter = this.operands[result.index];
        const child = hitter.primaryParser.parse(strObj);
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

class MyOr extends UserGroup {
    get candidate() {
        return this.args[0];
    }
    get selectLogic() {
        // 0: max(), 1: first(PEG)
        return 0;
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
    static candidates(bnfAstNode) {
        const candidate = bnfAstNode.instance.candidate;
        const c = bnfAstNode.children.find(t => t.baseType === candidate);
        const ast = bnfAstNode.children.find(t => t.baseType === CoreAsterisk);
        const defines = [c];
        for(const child of ast.children) {
            const c = child.children.find(t => t.baseType === candidate);
            defines.push(c);
        }
        return defines;
    }
    static generateSecondaryParser(bnfAstNode) {
        bnfAstNode.assertBaseInstanceOf(this);
        const candidates = this.candidates(bnfAstNode);
        const parsers = candidates.map(t => t.generateSecondaryParser);
        const test = (strObj, index) => {
            const lens = parsers.map(parser => parser.test(strObj, index));
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
                    if((max.length === undefined) || (max.length < len.length)) {
                        max.success = true;
                        max.length = len.length;
                        max.candidate = i;
                    }
                    if(!first.success) {
                        first.success = true;
                        first.length = len.length;
                        first.candidate = i;
                        if(this.selectLogic === 1) {
                            return first;
                        }
                    }
                }
                return max;
            })();
        };
        const process = (astNode, strObj, result) => {
            const decided = result.candidate;
            const child = parsers[decided].parse(strObj);
            astNode.addChild(child.node);
        };
        const parser = AstNode.parserWrapper(bnfAstNode, test, process);
        parser.candidates = candidates;
        return parser;
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
        return bnfAstNode.children[1].bnfStr;
    }
    static terminalTest(strObj, index, bnfAstNode) {
        const str = this.targetString(bnfAstNode);
        const target = strObj.read(index, str.length);
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
        const test = (strObj, index) => this.terminalTest(strObj, index, bnfAstNode);
        const process = (astNode, strObj, result) => {
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
    static terminalTest(strObj, index, bnfAstNode) {
        const str = this.targetString(bnfAstNode);
        const target = strObj.read(index, str.length);
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
    static terminalTest(strObj, index, bnfAstNode) {
        const strs = new Set(this.targetString(bnfAstNode).split(''));
        const target = strObj.read(index, 1);
        if(strs.has(target)) {
            return {
                success: true,
                length: 1
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
                    map.set(ev.nameHierarchy, ev.action);
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
    
    getExecuter(str, entryPoint = 'expr') {
        const strObj = new StringObject(str);
        this.#astManager = new AstManager;
        this.#bnfAstManager.leftRecursiveWrap(entryPoint);
        this.#bnfAstManager.evaluators = this.#evaluators;
        this.#astManager.evaluators = this.#evaluators;
        this.#astManager.root = this.#bnfAstManager.generateExecuter(strObj, entryPoint);
        return this.#astManager.root.evaluator;
    }
    get bnfStr() {
        return this.#bnfAstManager.root.bnfStr;
    }
    bnfDump() {
        this.#bnfAstManager.dump();
    }
    tokenDump() {
        this.#astManager.dump();
    }

}

class Parser {
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
    execute() {
        if(this.#program === undefined) {
            throw new RuntimeLayerError("No input provided for parsing.", Error);
        }
        if(this.#parserGenerator === undefined) {
            throw new RuntimeLayerError("Undefined grammar rule.", Error);
        }
        const executer = this.#parserGenerator.getExecuter(this.#program, this.#entryPoint);
        // this.#parserGenerator.tokenDump();
        console.log('-------------');
        console.log(executer.str);
        console.log('-------------');
        return executer.value;
    }
}

module.exports = {
    Parser
};
