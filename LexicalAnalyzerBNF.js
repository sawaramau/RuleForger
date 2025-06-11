"use strict"
/*
 * RuleForger - A parser generator for intuitive syntax and semantics
 * Copyright (c) 2025 k.izu
 * Licensed under the ISC License. See LICENSE file for details.
 */
const {
    StringObject,
    SelectLogic,
    Evaluator,
    AstNode,
    AstManager,
    BnfAstNode,
    CoreAstNode,
    LazyGenerator,
    AbstractGroup,
    CoreGroup,
    CoreNonTerminal,
    CoreTerminal,
    CoreTerminalDot,
    CoreTerminalSet,
    CoreNegTerminalSet,
    CoreWhite,
    AbstractRepeater,
    CoreRepeater,
    CoreAsterisk,
    CoreOption,
    CoreList,
    CorePlus,
    UserCoreGroup,
    CoreOr,
    UserRepeater,
    UserAsterisk,
    UserOption,
    UserPlus,
    UserTerminal,
    UserEscape,
    UserOr,
    Parentheses,
    Braces,
} = require('./common.js');

const {NotImplementedError, CoreLayerError, BnfLayerError, RuntimeLayerError, UncategorizedLayerError} = require('./Error.js');

/*
TOKEN : /regexp/ ~flag1 ~flag2 !exclude1 !exclude2 -> valType
 */

class CoreEntryPoint extends CoreGroup {
    get define() {
        return [CoreAsterisk.getOrCreate(this.parserGenerator, CoreExpr.getOrCreate(this.parserGenerator))];
    }
}

class CoreExpr extends CoreGroup {
    get define() {
        return [
            CoreOr.getOrCreate(this.parserGenerator, 
                Assign.getOrCreate(this.parserGenerator), 
                CoreOr.getOrCreate(this.parserGenerator, 
                    CoreTerminal.getOrCreate(this.parserGenerator, ';'), 
                    CoreTerminal.getOrCreate(this.parserGenerator, '\n')
                ), 
                CoreWhite.getOrCreate(this.parserGenerator)
            )
        ];
    }
}

class Assign extends UserCoreGroup {
    static get operator() {
        return ':';
    }
    get define() {
        return [
            AssignLeft.getOrCreate(this.parserGenerator), CoreWhite.getOrCreate(this.parserGenerator), CoreTerminal.getOrCreate(this.parserGenerator, Assign.operator), 
            CoreWhite.getOrCreate(this.parserGenerator), AssignRight.getOrCreate(this.parserGenerator), CoreWhite.getOrCreate(this.parserGenerator), 
        ];
    }
    static assign(bnfAstNode) {
        bnfAstNode.assertBaseInstanceOf(this);
        const left = bnfAstNode.children.find(t => t.baseType === AssignLeft);
        const right = bnfAstNode.children.find(t => t.baseType === AssignRight);
        return [left, right];
    }
}

class AssignLeft extends UserCoreGroup {
    get define() {
        return [
            CoreWhite.getOrCreate(this.parserGenerator),
            MyNonTerminal.getOrCreate(this.parserGenerator), 
            CoreWhite.getOrCreate(this.parserGenerator),
        ];
    }
    static argNames(bnfAstNode) {
        bnfAstNode.assertBaseInstanceOf(this);
        return [];
    }
    static nameHierarchy(bnfAstNode) {
        bnfAstNode.assertBaseInstanceOf(this);
        const hierarchies = bnfAstNode.digOne(MyNonTerminal, {required: true});
        return MyNonTerminal.nameHierarchy(hierarchies);
    }
}

class AssignRight extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            RightValue.getOrCreate(this.parserGenerator),
        ];
    }
    static getMostLeftNotNullableTerms(bnfAstNode) {
        // 字句解析に左再帰は存在しないので，空の配列を返す．
        return [];
    }
    static getAllTerms(bnfAstNode) {
        // 字句解析に左再帰は存在しないので，空の配列を返す．
        return [];
    }
}

class RightValue extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            UserRegExp.getOrCreate(this.parserGenerator),
            UserAsterisk.getOrCreate(this.parserGenerator, 
                CoreWhite.getOrCreate(this.parserGenerator),
                UserOr.getOrCreate(this.parserGenerator, 
                    UserFlag.getOrCreate(this.parserGenerator),
                    UserExclude.getOrCreate(this.parserGenerator),
                    UserType.getOrCreate(this.parserGenerator),
                ),
            ),
            CoreWhite.getOrCreate(this.parserGenerator, CoreWhite.whiteExcluder),
        ];
    }
    static valids() {
        throw new CoreLayerError("This method must be not called.", Error);
    }
    static getMetas(bnfAstNode) {
        bnfAstNode.assertBaseInstanceOf(this);
        const flags = bnfAstNode.dig(UserFlag).map(flag => UserFlag.flagName(flag));
        const excludes = bnfAstNode.dig(UserExclude).map(exclude => UserExclude.GetExcludeTokenSet(exclude));
        const type = bnfAstNode.dig(UserType, {min: 0, max: 1}).reduce((acc, cur) => UserType.getEvaluatorSetterStr(cur), undefined);
        return {
            flags, 
            excludes, 
            type
        };
    }
    static LL = class extends this.superCls {
        static generateSecondaryParser(bnfAstNode) {
            bnfAstNode.assertBaseInstanceOf(RightValue);
            const reg = bnfAstNode.children.find(t => t.baseType === UserRegExp);
            const ast = bnfAstNode.children.find(t => t.baseType === UserAsterisk);
            ast.valids = [1];
            const regParser = reg.generateSecondaryParser;
            const test = regParser.test;
            const process = (astNode, strObj, result, seed) => {
                const child = regParser.parse(strObj, seed);
                astNode.addChild(child.node);
            };
            return AstNode.parserWrapper(bnfAstNode, test, process);
        }

    };
}

class Name extends UserCoreGroup {
    static reuseable = true;
    get define() {
        const az = "abcdefghijklmnopqrstuvwxyz";
        const AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const digit = "0123456789";
        const symbol = "_";
        return [
            CoreTerminalSet.getOrCreate(this.parserGenerator, symbol, az, AZ), CoreAsterisk.getOrCreate(this.parserGenerator, CoreTerminalSet.getOrCreate(this.parserGenerator, symbol, az, AZ, digit))
        ];
    }
}

class MyNonTerminal extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            Name.getOrCreate(this.parserGenerator), 
            // CoreAsterisk.getOrCreate(this.parserGenerator, CoreWhite.getOrCreate(this.parserGenerator), CoreTerminal.getOrCreate(this.parserGenerator, MyNonTerminal.selector), CoreWhite.getOrCreate(this.parserGenerator), Name.getOrCreate(this.parserGenerator))
        ];
    }
    static get selector() {
        return '.';
    }
    static nameHierarchy(bnfAstNode) {
        bnfAstNode.assertBaseInstanceOf(this);
        return bnfAstNode.dig(Name);
    }
    static generateEvaluator(astNode) {
        return new Evaluator(astNode);
    }
    static LL = class extends this.superCls {
        static generateSecondaryParser(bnfAstNode) {
            const parser = bnfAstNode.bnfAstManager.getSecondaryParser(bnfAstNode);
            const test = (strObj, index, seed = null) => {
                const result = parser.test(strObj, index, seed);
                return result;
            };
            const process = (astNode, strObj, result, seed) => {
                astNode.nameHierarchy = bnfAstNode.bnfAstManager.getFullNameStr(result.space);
                return parser.process(astNode, strObj, result, seed);
            };
            return AstNode.parserWrapper(bnfAstNode, test, process);
        }

    };
}

class UserRegExp extends UserTerminal {
    static reuseable = true;
    get bracket() {
        return ['/', '/'];
    }
    get allowedOption() {
        return 'si';
    }
    get define() {
        const def = super.define;
        const opt = CoreAsterisk.getOrCreate(this.parserGenerator, 
            CoreTerminalSet.getOrCreate(this.parserGenerator, this.allowedOption),
        );
        def.push(opt);
        return def;
    }
    static terminalTest(strObj, index, bnfAstNode, seed) {
        const regStr = this.targetString(bnfAstNode);
        const opt = bnfAstNode.children[3].str;
        // 先頭から読むのでyオプションを追加
        const regExp = new RegExp(regStr, opt + "y");
        const testStr = strObj.read(index);
        const match = testStr.match(regExp);
        if(!match) {
            return {
                success: false
            };
        }
        return {
            success: true,
            length: match[0].length,
        };
    }
}

class UserFlag extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            CoreTerminal.getOrCreate(this.parserGenerator, '~'),
            CoreWhite.getOrCreate(this.parserGenerator),
            CoreOr.getOrCreate(this.parserGenerator, 
                CoreTerminal.getOrCreate(this.parserGenerator, "skip"),
                Name.getOrCreate(this.parserGenerator),
            )
        ];
    }
    static flagName(bnfAstNode) {
        bnfAstNode.assertBaseInstanceOf(this);
        return bnfAstNode.children[2].bnfStr;
    }
}

class UserExclude extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            CoreTerminal.getOrCreate(this.parserGenerator, '!'),
            CoreWhite.getOrCreate(this.parserGenerator),
            CoreOr.getOrCreate(this.parserGenerator, 
                Name.getOrCreate(this.parserGenerator),
                CoreGroup.getOrCreate(
                    this.parserGenerator, 
                    Braces.getOrCreate(this.parserGenerator, 
                        CoreList.getOrCreate(this.parserGenerator,
                            generator => MyNonTerminal.getOrCreate(generator)
                        ),
                    ),
                ),
            )
        ];
    }
    static GetExcludeTokenSet(bnfAstNode) {
        bnfAstNode.assertBaseInstanceOf(this);
        const or = bnfAstNode.children[2];
        const result = {};
        if(or.children[0].baseType === Name) {
            result.type = "flagName";
            result.flagName = or.children[0].bnfStr;
        } else {
            result.type = "names";
            result.names = or.dig(MyNonTerminal).map(bnf => bnf.bnfStr);
        }
        return result;
    }
}

class UserType extends UserCoreGroup {
    static reuseable = true;
    get define() {
        return [
            CoreTerminal.getOrCreate(this.parserGenerator, '->'),
            CoreWhite.getOrCreate(this.parserGenerator),
            Name.getOrCreate(this.parserGenerator),
        ];
    }
    static getEvaluatorSetterStr(bnfAstNode) {
        bnfAstNode.assertBaseInstanceOf(this);
        return bnfAstNode.children[2].bnfStr;
    }
}

module.exports = {
    CoreEntryPoint,
    MyNonTerminal,
    Name,
    Assign,
    AssignRight,
    AssignLeft,
    RightValue
};
