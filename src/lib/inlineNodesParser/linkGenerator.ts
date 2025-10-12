import type {Node} from "./index"
import { PUNCTUATIONS, escapeSpecialCharacters, parseCharRef } from "./index"
import { caseFold } from "unicode-case-folding"

export interface LinkRefData {
	label: string;
	destination: string;
	title: string
}

/** An object containing link destination and title supposedly gotten from a link reference definition
 * @typedef {Object} LinkData
 * @property {null|string} destination
 * @property {null|string} title */

/** A node of the Linked List generated when parsing inline nodes when parsing the text
 * @typedef {Object} Node
 * @property {string} nodeType - string representing the type of node
 * @property {string} content - plain text content of the node
 * @property {null|Node} next - The next node in the linked list or null if this is the list's tail
 * @property {null|Node} prev - The previous node in the linked list or null if this is the list's head */


/** Returns a node that's a possible opening node for a link text marker's closing node
 * @param {Node} node - Node that requires an opening Node
 * @returns {Node|null} - The opening node if found, else null*/
function getOpener(node: Node) {
	let currentNode = node.prev;
	
	while (currentNode !== null) {
		if (currentNode.type === "link marker start") {
			return currentNode;
		}
		currentNode = currentNode.prev;
	}
	return null
}

interface LinkAttributes {
	destination: string;
	title: string;
}

/** Determines if a '[' character in a text is the start of a syntatically correct common mark label
 * @param {string} text - The string to extract the label data from
 * @param {number} startIndex - The index of the opening '[' link marker
 * @returns {(string|number)[]} If successful, an Array of two elements where the first is the label text and the second is the index 
 * where the label ends in a string. If unsccesful, the first element is null and second is -1 */
function getLabel(text: string, startIndex: number): [string, number] {
	let linkLabel = ""
	let charIsEscaped = false;
	let i = startIndex+1;

	while (true) {
		if (charIsEscaped) {
			linkLabel += text[i];
			charIsEscaped = false;
		}else if (text[i] === '\\' && i < text.length-1 && PUNCTUATIONS.includes(text[i+1])) {
			/* The backslash is kept as part of the text while still being able to escape punctuations because 
			the full label text is needed when a search for a link reference definition is to be done later */
			linkLabel += text[i];
			charIsEscaped = true
		}else if (text[i] === ']') {
			break;
		}else if (text[i] === '[') { // link label contains unescaped '['
			return [null, -1]
		}else{
			linkLabel += text[i]
		}
		if (i === text.length-1){
			return [null, -1]; // No link label was parsed yet
		}
		i++;
	}

	return [linkLabel, i]
}

/** Gets the string content of all the nodes between two nodes if no in-between node contains commonmark link markers
 * @param {Node} startNode 
 * @param {Node} endNode
 * @returns {string} the plain text content */
function getEnclosedText(startNode: Node, endNode: Node) {
	let currentNode = startNode.next;
	let outputText = "";

	while (currentNode !== endNode) {
		if (currentNode.type === "md link html")
			return null
		outputText += currentNode.content;
		currentNode = currentNode.next;
	}
	return outputText;
}

/** Normalize a string by doing a Unicode case fold, stripping leading and trailing spaces, tabs, and line endings, 
 * and collapsing consecutive internal spaces, tabs, and line endings to a single space.
 * @param {string} str - The string to be normalized
 * @returns {string} the normalized string */
function normalised(str: string) {
	let newStr = ""
	const targetWhiteSpace  = " \t\n" // String containing the only type of trailing and leading whitespace chracters to be stripped off 
	let prevWspTextIsTargetWsp = false // Indicates if the previous whitespace text is target whitespace

	for (let i=0; i<str.length; i++){
		if (targetWhiteSpace.includes(str[i]) && !prevWspTextIsTargetWsp) {
			prevWspTextIsTargetWsp = true
		}else if (!targetWhiteSpace.includes(str[i])) {
			if (prevWspTextIsTargetWsp && newStr){ // previous whitespace text is target whitespace and it's an internal space
				newStr += " "
				prevWspTextIsTargetWsp = false
			}
			newStr += caseFold(str[i])
		}
	}

	return newStr;
}

export interface LinkRefDataMap {
	[normalisedLabel:string]: LinkRefData
}

/** Creates an object whose attributes are the destination and title strings associated with a label text
 * @param {Object} linkRefs - Dictionary or Hash map mapping link labels to link attributes from commonmark link reference definitions
 * @param {string} labelStr - The label text whose destination and title is needed
 * @returns {{destination: ?string, title: ?string}} - The object containing the destination and title as attributez */ 
function getReferenceLinkData(labelStr: string, linkRefs: LinkRefDataMap): LinkAttributes {
	let refLinkData = linkRefs[normalised(labelStr)]
	if (!refLinkData)
		return {destination: null, title: null};
	return {destination: refLinkData.destination, title: refLinkData.title};
}

/** Creates an object whose attributes are the destination and title strings associated with the first reference link parsed in a string
 * @param {string} linkText - The parsed text in between the first set of square brackets in any common mark reference link
 * @param {string} unParsedLinkText - Unparsed link text in between the first set of square brackets in any common mark reference link
 * @param {string} textStream - The string containing the reference link
 * @param {number} startIndex - index of the closing ']' for the link text
 * @param {Object} linkRefs - Dictionary or Hash map mapping link labels to link attributes from commonmark link reference definitions
 * @returns {LinkData} - Destination and title maybe null if the link label is invalid */
function getReferenceLinks(linkText: string, unParsedLinkText: string, textStream: string, startIndex: number, linkRefs: LinkRefDataMap):[LinkAttributes, number] {
	let i = startIndex;
	if (i === textStream.length-1 || textStream[i+1] !== '[') {
		return [getReferenceLinkData(unParsedLinkText, linkRefs), i]; // shortcut links
	}
	let [labelText, labelTextEndIndex] = getLabel(textStream, i+1);
	let data: {destination: string, title: string} = {destination: null, title: null};

	if (labelText !== null) {
		if ((/\S/).test(labelText)) { // full reference links
			data = getReferenceLinkData(labelText, linkRefs)
		}else { // collapsed reference links
			data = getReferenceLinkData(unParsedLinkText, linkRefs)
		}
		
		if (data.destination)
			return [data, labelTextEndIndex]
	}else {
		data = getReferenceLinkData(unParsedLinkText, linkRefs)// shortcut links
	}
	return [data, startIndex];
}


/** Gets the string content of all the nodes between two nodes if the in-between node is a "text content node"
 * @param {Node} startNode 
 * @param {Node} endNode
 * @returns {string} the plain text content */
function getEnclosedPlainText(startNode: Node, endNode: Node) {
	let currentNode = startNode.next;
	let outputText = "";

	while (currentNode !== endNode) {
		if (currentNode.type === "text content")
			outputText += currentNode.content;
		else if (currentNode.type === "md img html") {
			const match = currentNode.content.match(/alt="([^]*)"/) // The alt text of an commonmark image is it's plain string content
			outputText += match[1];
		}
		currentNode = currentNode.next;
	}
	return outputText;
}


/** Transforms The content of common mark link nodes to either 'a' or 'img' html tags as appropriate 
 * @param {Node} openingNode
 * @param {Node} closingNode 
 * @param {LinkData} LinkAttributes
 * @param {string} linktext - link text*/
function transformToLinkHtml(openingNode: Node, closingNode: Node, attributes: LinkAttributes, linkText: string) {
	let linkType = openingNode.content === "![" ? "img" : "link";

	if (attributes.title)
		attributes.title = escapeSpecialCharacters(parseCharRef(attributes.title))

	// decode the uri first in case of characters already percent encoded because they will still be percent encoded
	attributes.destination = escapeSpecialCharacters(encodeURI(parseCharRef(decodeURI(attributes.destination))));
	if (linkType === "link") {
		openingNode.content = `<a href="${attributes.destination}"${attributes.title ? ' title="'+attributes.title+'"' : ""}>`;
		closingNode.content = `</a>`
	}else {
		openingNode.content = `<img src="${attributes.destination}" alt="${linkText}"${attributes.title ? ' title="'+attributes.title+'"' : ""} />`;
		openingNode.next = null;
	}
	if (linkType === "img") {
		openingNode.type = "md img html"
	}else {
		openingNode.type = "md link html"
		closingNode.type = "md link html"
	}
}

/** Determines if a character is the last character in any component (destination, title) of a common mark link
 * @param {string} startDelimiter - The part's dtart delimiter
 * @param {string} char - The character to check if it ends the part
 * @returns {boolean} true if it ends it, false if it doesn't*/
function currentLinkComponentHasEnded(startDelimiter: string,  char: string){
	const startEndDelimiterMapping: {[key: string]: string} = {"(": ")", "<": ">", "\"":"\"", "'": "'"};
	return startEndDelimiterMapping[startDelimiter] === char || (!startDelimiter && (" \t\n").includes(char))
}


/** Gets the destination and optionally title of an inline markdown link
 * @param {string} text - The string containing the markdown link
 * @param {number} startIndex - The index of the closing ']' of the link's link text
 * @returns {[[?string, ?string], number]} An Array of two elements where the first is an array containing 2 elements. first element is an array and 
 * the second is the index of the closing parenthesis for inline links. The inner has the link destination at index 0 and title at index 1 if successful, */
function getLinkComponents(text: string, startIndex: number) {
	let linkComponents: (string|null)[] = [null, null] // link destination will be in index 0. title will be in index 1
	let charIsEscaped = false
	let i = startIndex;
	let compIndex = 0;
	let compDelimiter = "" // the start delimiter of the link's component being processed. destination or title
	let unbalancedParen = 0 // unbalanced parenthesis inside link destination
	const titleStartDelimiters = "(\"'"
	const whitespaceMargin = " \t\n"

	while (i < text.length) {
		let char = text[i]
	
		if (char === ')' && !compDelimiter && !unbalancedParen && !charIsEscaped){
			if (compIndex === 0 && linkComponents[0] === null)
				linkComponents[0] = ""
			return [linkComponents, i];
		}
		if (compIndex < 2 && linkComponents[compIndex] === null) { // at least one unextracted link component
			if (compIndex == 0) {
				if (char === '<'){
					linkComponents[compIndex] = ""
					compDelimiter = char
				}else if ((/\S/).test(char)){
					linkComponents[compIndex] = ""
				}
			}else if (titleStartDelimiters.includes(char)) {
				compDelimiter = char
				linkComponents[compIndex] = ""
			}else if (!whitespaceMargin.includes(char)){
				return [[null, null], -1]
			}
			if (compDelimiter || linkComponents[compIndex] === null) { // component with a non-whitespace delimiter was started or it's just whitespace margin
				i++;
				continue; // the current character is not part of the component being processed actual content if any
			}
		}else if (!charIsEscaped) {
			if (currentLinkComponentHasEnded(compDelimiter, char)) {
				compIndex++;
				compDelimiter = "";
			}else if ((compDelimiter === char) || (compDelimiter === '<' && char === '\n')){
				return  [[null, null], -1]
			}else if (compIndex === 0 && !compDelimiter) { // component being parsed is whitespace delimited link destination
				if (char === ')'){
					unbalancedParen--
				}else if (char === '('){
					unbalancedParen++
				}
			}else if (compIndex === 2 && !whitespaceMargin.includes(char)) {
				return [[null, null], -1]
			}
		}

		if (char === "\\" && !charIsEscaped && (i < text.length-1) && PUNCTUATIONS.includes(text[i+1])){
			charIsEscaped = true
			i++;
			continue;
		}

		if (compIndex < 2 && linkComponents[compIndex] !== null){
			charIsEscaped = false
			linkComponents[compIndex] += char;
		}

		i++;
	}
	return [[null, null], -1]
}

/** Removes every string representing valid link reference definitions from a string, extracts the data and updates a hash map with the data
 * @param {string} text - The string to extract link reference definitions from
 * @param {Object} linkRefsMap - Hash map mapping link labels to link attributes from link reference definitions 
 * @returns {string} The remaining text after removing any valid link refernece definition text */
export function extractLinkRefsData(text: string, linkRefsMap: LinkRefDataMap) {
	let i = 0;
	let plainText = ""
	let startIndex = i;
	let linksData = []

	while (i<text.length) {
		startIndex = i

		let data = getLinkReferenceDefData(text, startIndex) as [string[], number]
		let components = data[0];
		i = data[1]

		if (components[0] !== null && components[0].length <= 999 && (/\S/).test(components[0])) {
			linksData.push(components)
			i++;
		}else { // this text is a paragraph
			plainText += text.slice(startIndex, text.length);
			break; // link ref definitions can't interrupt paragraphs so no need to look further
		}
	}

	for (let data of linksData) {
		const basicData = {label: data[0], destination: data[1], title: ""}
		if (data[2] !== null) {
			basicData.title = data[2]
		}
		const normalizedLabel = basicData.label.toLowerCase().replace(/\s+/, ' ').trim()
		if (!linkRefsMap[normalizedLabel])
			linkRefsMap[normalizedLabel] = basicData
	}
	return plainText;

}

/** Returns the index of the first new line character or the index of 
 * the last character if no new line character was found in a string
 * @param {string} text - The string whose current line last char index to be returned
 * @param {number} startIndex - The index to start checking from
 * @returns {number} - current line last character index */
function getEndOfLine(text: string, startIndex: number) {
	if (startIndex >= text.length-1) {
		return startIndex;	
	}
	for (let i=startIndex; i<text.length; i++) {
		if (text[i] === '\n') {
			return i
		}
		if (i === text.length-1)
			return i;
	}
}


/** Extract valid link reference definitions data from a string
 * @param {string} text - The string to extract link reference definitions data from
 * @param {number} startIndex - Index where the processing of the string should start from
 * @returns {[[string, string, string], number]} [["llink text", "link destination", ?"link title"], link_ref_text_end_index] or [[null, null, null], -1]*/
function getLinkReferenceDefData(text: string, startIndex: number) {
	let i = startIndex;
	let components:(string|null)[] = [null, null, null] // [text, destination, title]
	let compIndex = 0; // index of the link component currently being validated and extracted
	let compDelimiter = "" // the start delimiter of the link's component being processed. destination or title
	let unbalancedParen = 0; // unbalanced parenthesis inside link destination
	let charIsEscaped = false
	let result: [string[], number] = [[null, null, null], -1]
	const whitespaceMargin = " \t\n"

	while (i < text.length) {
		const char = text[i];

		if (compIndex === 3 || (compIndex < 3 && components[compIndex] === null)) {
			if ((compIndex === 0 && char === '[') || (compIndex === 1 && char === '<') || (compIndex === 2 && "'\"(".includes(char))){
				components[compIndex] = ""
				compDelimiter = char
			}else if (compIndex === 1 && !whitespaceMargin.includes(char)) { // first character of whitespace delimited link destination content
				components[compIndex] = ""
			}else if (whitespaceMargin.includes(char)){ // char could be the newline character where this link reference data ends
				if (char === '\n' && compIndex === 2){
					result = [components, i]
				}else if (char === '\n' && compIndex === 3) {
					return [components, i]
				}
			}else {
				if (result[1] > -1)
					return result
				// outside this function, Parsing needs continue on a new line of thi same text so end of line index is returned
				return [[null, null, null], getEndOfLine(text, i)]
			}
			if (compDelimiter && compIndex === 2 && !whitespaceMargin.includes(text[i-1])) // Title isn't separated from the link destination by spaces or tabs
				return [[null, null, null], getEndOfLine(text, i)]
			if (compDelimiter){ // component with a non-whitespace delimiter was started
				i++;
				continue;
			}
		}else if (compIndex < 3 && !charIsEscaped) {
			if (currentLinkComponentHasEnded(compDelimiter, char)) {
				compIndex++;
				compDelimiter = "";
				if (char === '\n' && compIndex === 2){
					result = [components, i]
				}
			}else if (compIndex === 0 && char === ']') {
				if (i < text.length-1 && text[i+1] === ':') {
					compIndex++;
					compDelimiter = "";
					i++;
				}else {
					return [[null, null, null], getEndOfLine(text, i)]
				}
			}else if ((compDelimiter === char) || (compDelimiter === '<' && char === '\n')){
				// char is part of a component thats not allowed to have it's delimiter as part of it's content or there's a new line inside link destination
				return [[null, null, null], getEndOfLine(text, i)]
			}else if (compIndex === 1 && !compDelimiter) {
				if (char === ')'){
					unbalancedParen--
				}else if (char === '('){
					unbalancedParen++
				}
			}
		}

		if (char === "\\" && !charIsEscaped && i < text.length-1 && PUNCTUATIONS.includes(text[i+1])){
			if (compIndex === 0)
				components[compIndex] += char;

			charIsEscaped = true
			i++;
			continue;
		}

		if (compIndex < 3 && components[compIndex] !== null){
			charIsEscaped = false
			components[compIndex] += char;
		}

		i++;
	}

	if (compIndex === 3 || (compIndex == 2 && (components[compIndex] === null) || (compIndex == 1 && compDelimiter === "" && components[compIndex] !== null))) {
		return [components, i]
	}
	return [[null, null, null], getEndOfLine(text, i)]
}


/** Parses a string for the first valid commonmark link (img, inline, reference e.t.c) and generates linked list
 * nodes containing the resulting html. This nodes are added to an already existing linked list.
 * @param {string} textStream - The string to be parsed
 * @param {Node} closer - The tail of the linked list to be updated. It's also the node containing the closing delimiter (']') of the potential link
 * @param {Object} linkRefsMap - Hash map mapping link labels to link attributes from link reference definitions 
 * @param {string} startIndex - Index of the character to start parsing from. This is also the index of the closing delimiter (']')
 * @returns {[Node, number]} - The node where the generated raw html ends and the index where the link ends in the textStream*/
export function generateLinkHtmlNode(textStream: string, closer: Node, linkRefs: LinkRefDataMap, startIndex: number) : [Node, number] {
	let linkAttributes: {destination: string, title: string} = {destination: null, title: null}
	const opener = getOpener(closer)
	if (!opener)
		return [null, -1];
	
	let linkText = ""
	if (opener.content === '[') // normal link start delimiter
		linkText = getEnclosedText(opener, closer);
	else // img link start delimiter
		linkText = getEnclosedPlainText(opener, closer);

	if (linkText === null) {
		opener.type = "text content"
		closer.type = "text content"
		return [null, -1];
	}
	closer.charIndex = startIndex

	let i = startIndex;
	if (i < textStream.length-2 && textStream[i+1] === "(") { // inline links
		i+=2; // Destination parsing should start immediately after the '(' character
		let [components, endIndex] = getLinkComponents(textStream, i) as [string[], number]
		linkAttributes.destination = components[0]
		linkAttributes.title = components[1]
		if (i > -1)
			i = endIndex;
	}

	if (linkAttributes.destination === null) { // inline link parsing failed
		// possibly a link reference
		const unParsedLinkText = textStream.slice(opener.charIndex+1, closer.charIndex);
		[linkAttributes, i] = getReferenceLinks(linkText, unParsedLinkText, textStream, i, linkRefs);		
	}
	
	if (linkAttributes.destination === null) { // not an inline link and not a link reference
		// opening and closing delimters don't count as special characteers 
		opener.type = "text content"
		closer.type = "text content"
		return [null, -1];
	}else {
		linkAttributes.title = linkAttributes.title && parseCharRef(linkAttributes.title)
		transformToLinkHtml(opener, closer, linkAttributes, linkText)
		if (opener.type === "md img html")
			return [opener, i]; // `i` is the index where the link ends in the string
		return [closer, i]
	}	
}

