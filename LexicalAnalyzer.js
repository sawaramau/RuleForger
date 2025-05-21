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
        return {
            success: false,
        };
    }
    test(strObj, index, seed) {
        const digits = new Set("0123456789".split(''));
        const first = strObj.read(index, 1);
        if(first === "0") {
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
    process (astNode, strObj, result, seed) {
        strObj.shift(result.length);
        astNode.length = result.length;
    };
}

module.exports = {
    LexicalAnalyzer
};