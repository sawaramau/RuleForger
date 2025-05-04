"use strict"

class MySet extends Set {
    static toSet(set) {
        if(set instanceof Array) {
            return new MySet(set);
        }
        return set;
    }
    get clone() {
        const clone = new MySet;
        for(const elm of this) {
            clone.add(elm);
        }
        return clone;
    }
    or(set) {
        set = MySet.toSet(set);
        const newSet = new MySet;
        for(const elm of this) {
            newSet.add(elm);
        }
        for(const elm of set) {
            newSet.add(elm);
        }
        return newSet;
    }
    merge(set) {
        set = MySet.toSet(set);
        for(const elm of set) {
            this.add(elm);
        }
    }
    and(set) {
        set = MySet.toSet(set);
        const newSet = new MySet;
        for(const elm of set) {
            if(this.has(elm)) {
                newSet.add(elm);
            }
        }
        return newSet;
    }
    diff(set) {
        set = MySet.toSet(set);
        const newSet = new MySet;
        for(const elm of this) {
            if(!set.has(elm)) {
                newSet.add(elm);
            }
        }
        return newSet;
    }
    map(func) {
        const newSet = new MySet;
        for(const elm of this) {
            newSet.add(func(elm));
        }
        return newSet;
    }
    xor(set) {
        return this.or(set).diff(this.and(set));
    }
    isSub(set) {
        set = MySet.toSet(set);
        const or = this.or(set);
        //console.log('self:', this.size, 'other:', set.size, 'result:', or.size === set.size);
        return or.size === set.size;
    }
    isSuper(set){
        set = MySet.toSet(set);
        const or = this.or(set);
        //console.log('self:', this.size, 'other:', set.size, 'result:', or.size === this.size);
        return or.size === this.size;
    }
}

function isSubclassOf(child, parent) {
    if (typeof child !== 'function' || typeof parent !== 'function') return false;

    let proto = child.prototype;
    while (proto) {
        if (proto === parent.prototype) return true;
        proto = Object.getPrototypeOf(proto);
    }
    return false;
}

class BtreeKey {
    #elm;
    #counter = 1;
    #next;
    #prev;
    constructor(element) {
        this.#elm = element;
    }
    get value() {
        return this.#elm;
    }
    get next() {
        return this.#next;
    }
    get prev() {
        return this.#prev;
    }
    set next(val) {
        return this.#next = val;
    }
    set prev(val) {
        return this.#prev = val;
    }
    inc() {
        this.#counter++;
    }
    dec() {
        this.#counter--;
    }
    get count() {
        return this.#counter;
    }
}

class BtreeManager {
    #root;
    #compare;
    constructor(compare, raw = true, dimension = 5, plus = true) {
        this.#root = new BtreeNode(dimension, plus, raw);
        this.#compare = compare;
    }
    search(obj, compare = this.#compare) {
        const key = new BtreeKey(obj);
        return this.#root.search(key, compare);
    }
    insert(obj, compare = this.#compare) {
        const key = new BtreeKey(obj);
        const result = this.#root.insert(key, compare);
        if(result.balanced) {
            if(result.found) {
                // result.key.inc();
            }
            return result;
        }
        const newRoot = this.#root.newBtreeNode([result.newKey], [this.#root, result.newNode]);
        this.#root = newRoot;
        return {
            balanced: true,
            found: false,
            key: result.key,
        };
    }
    remove(obj, compare = this.#compare) {
        const key = new BtreeKey(obj);
        const result = this.#root.remove(key, compare);
        if(!result.isEmpty) {
            return result;
        }
        throw "未実装"
    }
    process(func, forBpt = false) {
        return this.#root.process(func, forBpt);
    }
}

class BtreeNode {
    #bucket = [];
    #ptr = [];
    #left = null;
    #right = null;
    #dimension;
    #bpt;
    #rawCompare;
    constructor(dimension = 2, plus = 1, raw = false) {
        this.#dimension = dimension;
        this.#bpt = plus;
        this.#rawCompare = raw;
    }
    newBtreeNode(bucket, ptr) {
        const node = new BtreeNode(this.#dimension, this.#bpt, this.#rawCompare);
        node.#bucket = bucket.map(e => e);
        node.#ptr = ptr.map(e => e);
        return node;
    }
    get isEmpty() {
        return this.#bucket.length === 0;
    }
    get maxKey() {
        return this.#dimension * 2;
    }
    get removable() {
        return this.#bucket > this.#dimension;
    }
    mergeable(node) {
        return (this.#bucket.length + node.#bucket.length) < (this.#dimension * 2);
    }
    get min() {
        const compare = () => -1;
        return this.#recursive(null, compare, null,
            (result, found, node) => {
                return node.#bucket[result.index];
            }
        );
    }
    get max() {
        const compare = () => 1;
        return this.#recursive(null, compare, null,
            (result, found, node) => {
                return node.#bucket[result.index - 1];
            }
        );
    }
    insert(key, compare) {
        const insert = (node, addKey, index, addNode) => {
            node.#bucket.splice(index, 0, addKey);
            if(addNode) {
                node.#ptr.splice(index + 1, 0, addNode);
            }
            if(node.#bpt && (node.#ptr.length === 0)) {
                if(index === 0) {
                    if(node.#left) {
                        addKey.prev = node.#left.#bucket.slice(-1)[0];
                        node.#left.#bucket.slice(-1)[0].next = addKey;
                    }
                } else {
                    addKey.prev = node.#bucket[index - 1];
                    node.#bucket[index - 1].next = addKey;
                }
                if(index === node.#bucket.length - 1) {
                    if(node.#right) {
                        addKey.next = node.#right.#bucket[0];
                        node.#right.#bucket[0].prev = addKey;
                    }
                } else {
                    addKey.next = node.#bucket[index + 1];
                    node.#bucket[index + 1].prev = addKey;
                }
            }
            if(node.#bucket.length <= node.maxKey) {
                return {
                    balanced: true,
                    found: false,
                    key: key,
                };
            }
            const lbucket = node.#bucket.filter((e, i) => i < node.#dimension);
            const lptr = node.#ptr.filter((e, i) => i <= node.#dimension);
            const m = node.#bucket[node.#dimension];
            const rbucket = (() => {
                if(node.#bpt && (node.#ptr.length === 0)) {
                    return node.#bucket.filter((e, i) => i >= node.#dimension);
                }
                return node.#bucket.filter((e, i) => i > node.#dimension);
            })();
            const rptr = node.#ptr.filter((e, i) => i > node.#dimension);
            const newNode = node.newBtreeNode(rbucket, rptr);
            node.#bucket = lbucket;
            node.#ptr = lptr;

            newNode.#right = node.#right;
            node.#right = newNode;
            newNode.#left = node;
            if(newNode.#right) {
                newNode.#right.#left = newNode;
            }
            return {
                balanced: false,
                found: false,
                key: key,
                newKey: m,
                newNode: newNode
            };
        };
        return this.#recursive(key, compare, 
            // found
            (res, found) => {
                return {
                    balanced: true,
                    found: true,
                    key: found
                };
            }, 
            // not found
            (result, found, node) => {
                return insert(node, key, result.index);
            }, 
            // upstream
            (result, arg, node) => {
                if(arg.balanced) {
                    return {
                        balanced: true,
                        found: arg.found,
                        key: arg.key
                    };
                }
                return insert(node, arg.newKey, result.index, arg.newNode);
            }
        );
    }
    rebalance(midNode) {
        const index = this.#ptr.findIndex(n => n === midNode);
        const leftNode = (index > 0) ? this.#ptr[index - 1] : null;
        const rightNode = (index < this.#bucket.length - 1) ? this.#ptr[index + 1] : null;
        const mergeables = [];
        const mergedisables = [];
        if(leftNode) {
            if(midNode.mergeable(leftNode)) {
                mergeables.push([leftNode, index - 1, midNode]);
            } else {
                mergedisables.push([index - 1, leftNode, leftNode.max, 1]);
            }
        }
        if(rightNode) {
            if(midNode.mergeable(rightNode)) {
                mergeables.push([midNode, index, rightNode]);
            } else {
                mergedisables.push([index, rightNode, rightNode.min, -1]);
            }
        }
        if(mergeables.length) {
            const l = mergeables[0][0];
            const idx = mergeables[0][1];
            const r = mergeables[0][2];
            const newBucket = l.#bucket.map(e => e);
            const newPtr = l.#ptr.map(e => e);
            newBucket.push(this.#bucket[idx]);
            for(let i = 0; i < r.#bucket.length; i++) {
                newBucket.push(r.#bucket[i]);
            }
            for(let i = 0; i < r.#ptr.length; i++) {
                newPtr.push(r.#ptr[i]);
            }
            const newNode = this.newBtreeNode(newBucket, newPtr);
            this.#bucket.splice(idx, 1);
            this.#ptr.splice(idx, 2, newNode);
            newNode.#left = l.#left;
            newNode.#right = r.#right;
            if(newNode.#right) {
                newNode.#right.#left = newNode;
            }
            if(newNode.#left) {
                newNode.#left.#right = newNode;
            }
        } else if(mergedisables.length) {
            const dstNode = midNode;
            const idx = mergedisables[0][0];
            const srcNode = mergedisables[0][1];
            const newKey = mergedisables[0][2];
            const retVal = mergedisables[0][3];
            srcNode.remove(newKey, (l, r) => {
                if(r === newKey) {
                    return 0;
                }
                return retVal;
            });
            dstNode.insert(this.#bucket[idx], () => -retVal);
            this.#bucket[idx] = newKey;
        } else {
            throw "";
        }
        return this.balanced;
    }
    get balanced() {
        if(this.#bucket.length < this.#dimension) {
            return false;
        }
        if(this.#bucket > this.maxKey) {
            return false;
        }
        return true;
    }
    remove(key, compare) {
        return this.#recursive(key, compare,
            // found
            (result, found, node) => {
                const key = found;
                const rightNode = node.#ptr[result.index + 1];
                if(rightNode) {
                    // キーが葉節点でないならば，右枝から最小のキーによって上書きする
                    // その上で，右枝から消すべきキーを削除してバランス木として成立するか確認する
                    const min = rightNode.min;
                    node.#bucket[result.index] = min;
                    const res = (() => {
                        if(node.#bpt) {
                            // B+Treeであれば，右枝から消すべきキーは変更なし．
                            return rightNode.remove(key, compare);
                        }
                        // B-Treeであれば，右枝から消すべきキーは最小値
                        return rightNode.remove(min, (l, r) => {
                            if(r === min) {
                                return 0;
                            }
                            return -1;
                        });
                    })();
                    if(!res.balanced) {
                        node.rebalance(rightNode);
                    }
                } else {
                    if(node.#bpt) {
                        if(found.next) {
                            found.next.prev = found.prev;
                        }
                        if(found.prev) {
                            found.prev.next = found.next;
                        }
                    }
                    // 葉節点上のキーであれば気にせず削除する
                    node.#bucket.splice(result.index, 1);
                }
                return {
                    balanced: node.balanced,
                    found: true,
                    key: key,
                };
            },
            // not found
            (result, found, node) => {
                // 対象を発見できなかったため，なにも変更はない．
                return {
                    balanced: true,
                    found: false,
                    key: undefined,
                };
            },
            // upstream
            (result, ret, node) => {
                if(ret.balanced) {
                    return ret;
                }
                const index = result.index;
                const midNode = node.#ptr[index];
                node.rebalance(midNode);
                return {
                    balanced: node.balanced,
                    found: ret.found,
                    key: ret.key,
                };
            },
        );
    }

    search(key, compare) {
        return this.#recursive(key, compare, (res, found) => found, () => null);
    }
    #recursive(key, compare, found, notFound, upstream) {
        const result = this.#binSearch(key, compare);
        if(result.found) {
            if(found) {
                return found(result, this.#bucket[result.index], this);
            }
            return;
        }
        const bTree = this.#ptr[result.index];
        if(bTree) {
            const ret = bTree.#recursive(key, compare, found, notFound, upstream);
            if(upstream) {
                return upstream(result, ret, this);
            }
            return ret;
        }
        if(notFound) {
            return notFound(result, null, this);
        }
        return;
    }
    #binSearch(target, compare, array = this.#bucket, start = 0, end = array.length - 1) {
        if(start > end) {
            return {
                found: false,
                index: start
            };
        }
        const mid = Math.floor((start + end) / 2);
        const midValue = array[mid];
        const result = (() => {
            if(this.#rawCompare) {
                const t = target?.value;
                return compare(t, midValue.value, this);
            }
            return compare(target, midValue, this);
        })();
        if(result === 0) {
            return {
                found: true,
                index: mid
            };
        } else if(result < 0) {
            return this.#binSearch(target, compare, array, start, mid - 1);
        } else if(result > 0) {
            return this.#binSearch(target, compare, array, mid + 1, end);
        }
        throw "xxx";
    }
    process(func, forBpt = false) {
        if(this.#bpt) {
            if(forBpt) {
                let key = this.min;
                while(key) {
                    func(key.value, key);
                    key = key.next;
                }
            } else {
                this.#recursive(
                    null, () => -1, undefined, 
                    (result, found, node) => {
                        let next = node;
                        while(next) {
                            for(const key of next.#bucket) {
                                func(key.value, key);
                            }
                            next = next.#right;
                        }
                    }
                );    
            }
            return;
        }
        for(let i = 0; i < this.#dimension * 4 + 1; i++) {
            const index = Math.floor(i / 2);
            if((i % 2) === 0) {
                if(this.#ptr[index]) {
                    this.#ptr[index].process(func);
                }
            } else {
                if(index < this.#bucket.length) {
                    const key = this.#bucket[index];
                    func(key.value, key);
                }
            }
        }    
    }
}

class ExArray extends Array {}

module.exports = {
    Set: MySet,
    BtreeManager,
    isSubclassOf,
    ExArray
};

Object.defineProperty(module.exports, "String", {
    get: () => {
        Object.defineProperties(String.prototype, {
            strWidth: {
                get: function() {
                    return (style) => {
                        if(style === undefined) {
                            return this.length;
                        }
                        return this.length;
                    };
                }
            },
        });        
    }
})
