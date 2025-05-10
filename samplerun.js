"use strict"

const {Parser} = require("./main.js")


const str = 
`
entrypoint = $expr
expr($c,$a) = $term:term
expr.add = {$v3:term(\`40\`)}$v1:expr white '+' white $v2:term
expr.minus = $v1:expr white '-' white $v2:term
term = $num:(nonZero digits*) | $num:'0'  
digits = '0123456789'
nonZero = '123456789'
e = ''
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
        nameHierarchy: "expr",
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
        nameHierarchy: "expr.minus",
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
// parser.program = "1 + 2 - 3 - 5";
parser.program = "1 + 2 - 3 + 4";
console.log('-------------');
console.log(parser.bnfStr);
console.log('-------------');

//console.log(parser.bnfStr);
console.log('Result:', parser.execute());
