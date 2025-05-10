"use strict"

const {RuleForger} = require("./main.js")


const str = 
`
// コメントアウトを使用可能
/* コメントアウトの書式は標準この2パターン */
// $name:ruleでルールに名前を与えることで，action定義側から呼び出し可能になる．（$を付加しない要素は意味を持てない）
// BNFのエントリポイント名称はparse時に指定
entrypoint = $line 
// ORの記述をドット演算子でも表現可能（通常の|でもOK）
// 選択ロジックは現状最長マッチ（各所のselectLogicを1に変えればそれなりにfirst matchになると思うが，全部そうなっているかは未検討）
line.expr = $expr; line.proddiv = $proddiv; // ワンライナーで書いたり，行末にコメントを書くなら文末記号;を省略せずに書く
// name:を省略した場合，ルール名称がそのまま別名となる．
expr = $term
// 左再帰記述OK
expr.add = $v1:expr white '+' white $v2:term
// 各定義の左側にデフォルト値を与えるような記述が可能
expr.minus = $v1:expr white '-' white $v2:term | {$v1:term(\`40\`), $v2:term(\`10\`)} white "aa" white
proddiv = $term
proddiv.prod = $v1:proddiv white '*' white $v2:term
proddiv.div = $v1:proddiv white '/' white $v2:term
// 非終端文字以外にも別名を与えられるが，.valueは文字列等を返却する
// 繰り返し要素(*, +)や位置マッチ(!)に対する参照は配列やtrue/falseを返却するはず（もう忘れた）．
term = $altName:(nonZero $digits:digits*) | $zero:'0'
// ''は文字集合，""は文字列，i""は大文字小文字無視の文字列
// 終端文字の設定はUserTerminalsを参照
// 逆スラッシュをエスケープ文字として登録しているので，'や"を終端文字として読み込むまではできるが，
// エスケープ文字とセットでどう解釈するか，という内容をまだなにも定義していない．詳細はstatic targetStringあたりを眺める．
digits = '0123456789'
nonZero = '123456789'
e = ''
white = e | ' '* 
`;
const ruleForger = new RuleForger;
const evals = [
    {
        ruleName: "entrypoint",
        // actionの第1引数はBNFで$記号を用いて名前を与えた要素
        action: $ => {
            // .valueで該当要素のactionの実行結果を得られる．
            // .strで該当要素の文字列を得られる．
            return $.line.value;
        }
    },
    // entrypointは最初なのであえてルールを記載したが，
    // 参照引数を1つしか設定していないルールはactionを定義せずとも自動で1つ目の引数のvalueを返却する
    // {
    //     ruleName: "line.expr",
    //     action: $ => {
    //         return $.expr.value;
    //     }
    // },
    // {
    //     ruleName: "expr",
    //     action: $ => {
    //         return $.term.value;
    //     }
    // },
    {
        ruleName: "expr.add",
        action: $ => {
            return $.v1.value + $.v2.value;
        }
    },
    {
        ruleName: "expr.minus",
        action: $ => {
            // BNF上で定義した値とそうでない値はactionからは区別されない．
            return $.v1.value - $.v2.value;
        }
    },
    {
        ruleName: "proddiv.prod",
        action: $ => {
            return $.v1.value * $.v2.value;
        }
    },
    {
        ruleName: "proddiv.div",
        action: $ => {
            return $.v1.value / $.v2.value;
        }
    },
    {
        ruleName: "term",
        // actionの第2引数はこのルールにマッチした文字列全体
        action: ($, str) => {
            // $digitsは繰り返し要素*にかかっているので配列として返却される．
            // console.log($.altName.value.digits.value);
            return Number(str);
        }
    },
];
ruleForger.bnf = str;
ruleForger.dumpBnfAST(); // このパーサジェネレータが与えられたBNFをどう解釈しているかdumpする．
ruleForger.evaluators = evals;
ruleForger.entryPoint = 'entrypoint';
const programs = ["1 - 2 + 3", "2/3 * 4", "aa - 3"];
for(const prog of programs) {
    ruleForger.program = prog;
    const result = ruleForger.parse();
    console.log('Result:', result.executer.value);    
}
ruleForger.dumpProgramAST(); // 特に引数を指定しなければ最後にparseしたプログラムの抽象構文木をdumpする．
