"use strict"



class LexicalAnalyzer {
    set tokens(val) {

    }
    testBnf(strObj, index) {
        const str = strObj.read(index, 6);
        if(str === "NUMBER") {
            return {
                success: true,
                length: str.length,
            };
        }
        const plus = strObj.read(index, 4);
        if(plus === "PLUS") {
            return {
                success: true,
                length: plus.length,
            };
        }
        const white = strObj.read(index, 5);
        if(white === "WHITE") {
            return {
                success: true,
                length: white.length,
            };
        }
        return {
            success: false,
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