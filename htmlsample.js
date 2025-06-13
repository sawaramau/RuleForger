"use strict"

const {RuleForger} = require("./RuleForger.js")

const parentBnf = 
`
TagName = "html" | "div" | "span"
Tag = "<"$TagName (White+ Attribute)*">" Contents "</"$$TagName">"
Contents = ('^<>' | Tag)*
Attribute = AttrName White* '=' Value
AttrName = "Attr" | "a" | "href"
Value = "x"*
White = ' \\n\\t'
`;

const mainForger = new RuleForger;
mainForger.setSyntax(parentBnf);
// mainForger.dumpBnfAST();
mainForger.dumpCoreAst();
mainForger.entryPoint = 'Tag';
const programs = ["<html a=x><div>aa</div>  </html>"];
for(const prog of programs) {
    mainForger.parse(prog);
    // mainForger.dumpProgramAST();
}
