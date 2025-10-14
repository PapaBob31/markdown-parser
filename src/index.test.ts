import {test, expect} from "vitest"
import parse from "./index"

const testsArray = require('./spec.json')
for (let i=0; i<652; i++) {
  test(`Common Mark Test ${i+1}`, ()=>{
    expect(parse(testsArray[i]["markdown"], false)).toBe(testsArray[i]["html"])
  })
}
