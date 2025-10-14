import {test, expect} from "vitest"
import { tokenizeLine } from "./index"

test(`Line Tokenization`, ()=>{
  expect(tokenizeLine("> 1. \t> Blockquote", 0)[0]).toStrictEqual([">", " ", "1.", " \t", ">", " ", "Blockquote"])
})

test(`Line Tokenization 1`, ()=>{
  const results = tokenizeLine("    a simple\nindented code block", 0)
  expect(results[0]).toStrictEqual(["    ", "a" , " ", "simple", "\n"])
  expect(results[1]).toStrictEqual(12)
})

test(`Line Tokenization 2`, ()=>{  
  const results = tokenizeLine("**  * ** * ** * **", 0)
  expect(results[0]).toStrictEqual(["**", "  " , "*", " ", "**", " ", "*", " ", "**", " ", "*", " ", "**"])
})

test(`Line Tokenization 3`, ()=>{
  const results = tokenizeLine("##### foo ##", 0)
  expect(results[0]).toStrictEqual(["#####", " ", "foo", " ", "##"])
  expect(results[1]).toStrictEqual(11)
})

test(`Line Tokenization 4`, ()=>{
  const results = tokenizeLine("``` aa ```", 0)
  expect(results[0]).toStrictEqual(["```", " ", "aa", " ", "```"])
  expect(results[1]).toStrictEqual(9)
})

test(`Line Tokenization 5`, ()=>{
  const results = tokenizeLine("~~~~    ruby startline=3 $%@#$\ndef foo(x)\n  return 3\nend\n~~~~~~~", 0)
  expect(results[0]).toStrictEqual(["~~~~", "    ", "ruby", " ", "startline=3", " ", "$%@", "#", "$", "\n"])
  expect(results[1]).toStrictEqual(30)
})
