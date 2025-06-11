"use strict"

const {
    BnfAstManager,
    CoreOr,
    CoreGroup,
    UserCoreGroup,
    CoreTerminal,
    CoreAsterisk,
    CoreWhite,
    CoreOption,
    StringObject,
    Parentheses,
    Braces,
} = require('./common');
const {
    CoreEntryPoint,
    MyNonTerminal,
    Name,
    Assign,
    AssignRight,
    AssignLeft,
    RightValue,
    ModeSwitcher,
    Renamer,
    Arguments,
    UserOption,
    ClassCategory,
} = require('./RuleForgerBNF.js');

class SimpleDictWord extends UserCoreGroup {
    get define() {
        return [
            Name.getOrCreate(this.parserGenerator), 
            CoreWhite.getOrCreate(this.parserGenerator),
            CoreTerminal.getOrCreate(this.parserGenerator, ':'),
            CoreWhite.getOrCreate(this.parserGenerator),
            Name.getOrCreate(this.parserGenerator), 
        ];
    }
}

class SimpleDictContents extends UserCoreGroup {
    get define() {
        return [
            CoreWhite.getOrCreate(this.parserGenerator),
            CoreAsterisk.getOrCreate(this.parserGenerator,
                SimpleDictWord.getOrCreate(this.parserGenerator),
                CoreWhite.getOrCreate(this.parserGenerator),
                CoreTerminal.getOrCreate(this.parserGenerator, ','),
                CoreWhite.getOrCreate(this.parserGenerator),
            ),
            CoreOption.getOrCreate(this.parserGenerator,
                SimpleDictWord.getOrCreate(this.parserGenerator),
            ),
            CoreWhite.getOrCreate(this.parserGenerator),
        ];
    }
}

class SimpleDictionary extends UserCoreGroup {
    get define() {
        return [
            Braces.getOrCreate(this.parserGenerator, SimpleDictContents.getOrCreate(this.parserGenerator))
        ];
    }
}

class Preprocessor {
    #entryPoint = Preprocessor.EntryPoint.getOrCreate(this);
    #bnfAstManager;
    static get EntryPoint() {
        return CoreEntryPoint;
    }
    remap(remappers) {
        for(const remapper of remappers) {
            this.#entryPoint.overrideOperandsForPreprocess(remapper.cond, remapper.mapperFn);
        }
    }
    analyze(str) {
        const strObj = new StringObject(str);
        this.#bnfAstManager = new BnfAstManager(Preprocessor.Cls, ClassCategory);
        this.#bnfAstManager.parserGenerator = this;
        this.#bnfAstManager.root = this.#entryPoint.primaryParser.parse(strObj).node;
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
    get bnfStr() {
        return this.#bnfAstManager.root.bnfStr;
    }
    dumpBnfAST() {
        this.#bnfAstManager.dump();
    }
}

const remappers = [
    {
        cond: node => node instanceof ModeSwitcher,
        mapperFn: (operands, node) => {
            const parserGenerator = node.parserGenerator;
            const orgArguments = operands[2];
            const exArguments = CoreOption.getOrCreate(parserGenerator, Parentheses.getOrCreate(parserGenerator, SimpleDictionary.getOrCreate(parserGenerator)));
            const newArguments = CoreOr.getOrCreate(parserGenerator, 
                orgArguments,
                exArguments
            );
            operands[2] = newArguments;
            return [...operands];
        },
    },
];

const preprocessor = new Preprocessor;
preprocessor.remap(remappers);
const bnf = `
test = "start " @mode(test) ":end"
test = "start2 " @mode({mode:test, entry:ep}) ":end"
`;

preprocessor.analyze(bnf);
console.log(preprocessor.bnfStr);
preprocessor.dumpBnfAST();
