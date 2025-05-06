"use strict"

const {Parser} = require("./main.js")


const str = 
`
entrypoint = $expr
// expr($c,$a) = $term:term
// expr.add = {$v3:term(\`11\`), $v4:term(\`11\`),} $v1:expr white '+' white $v2:term
expr = $v1:term white '-' white $v2:term | {$v2:term(\`0\`)} $v1:expr
// expr.add = {$v3:term(\`11\`), $v4:term(\`11\`),} $v1:term white '+' white $v2:expr
// expr.minus = {$v3:term(\`11\`), $v4:term(\`11\`),} white $v1:term white !'+' '-' white $v2:expr
term = $num:(nonZero digits*) | $num:'0' | ('aaaaaaaa' | ('bbbbbbb')) 
digits = '0123456789'
nonZero = '123456789'
e = ""
white = e | ' '* 
`;
const parser = new Parser;
const evals = [
    {
        nameHierarchy: "entrypoint",
        action: $ => {
            return $.expr.value;
        }
    },
    {
        nameHierarchy: "entrypoint2",
        action: $ => {
            return $.expr.value;
        }
    },
    {
        nameHierarchy: "exprx",
        action: $ => {
            return $.term.value;
        }
    },
    {
        nameHierarchy: "expr.add",
        action: $ => {
            return $.v1.value + $.v2.value;
        }
    },
    {
        nameHierarchy: "expr",
        action: $ => {
            return $.v1.value - $.v2.value;
        }
    },
    {
        nameHierarchy: ["term"],
        action: $ => {
            return Number($.num.str);
        }
    },
];
parser.bnf = str;
parser.evaluators = evals;
parser.entryPoint = 'entrypoint';
parser.program = "1 - 2 - 3 - 2";
console.log('-------------');
console.log(parser.bnfStr);
console.log('-------------');

//console.log(parser.bnfStr);
console.log(parser.execute());
