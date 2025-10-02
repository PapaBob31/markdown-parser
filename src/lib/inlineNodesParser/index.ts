import generateEmNodes, { setAsLeftOrRightFlanking } from "./emphasisGenerator"
import type { LinkRefData, LinkRefDataMap } from "./linkGenerator"
import { generateLinkHtmlNode } from "./linkGenerator"
const validEntityRefs = require('../entities.json')

export const PUNCTUATIONS = "<>;,.()[]{}!`~+-_!=*&^%$#@\\/\"':?~|"; // is this all the possible punctuations?

export interface Node {
	content: string;
	type: string;
	closed: boolean;
	next: Node|null;
	prev: Node|null;
	charIndex?: number;
}

export function escapeSpecialCharacters(text: string) {
	let i=0;
	let escapedText = ""

	while (i < text.length){
		if (PUNCTUATIONS.includes(text[i])) {
			escapedText += getEscapedForm(text[i]);
		}else {
			escapedText += text[i];
		}
		i++;
	}
	return escapedText
}

// validates an array containing the parts of an html tag in order according to the html spec
function isValidHtmlTag(components: string[]) {
	let prevComponentType = "";
	if ((/^<\w+$/).test(components[0])) {
		prevComponentType = "html tag"
	}else {
		return false
	}

	for (let i=1; i<components.length; i++) {
		if (prevComponentType === "attr name" && components[i] === '=') {
			prevComponentType = "value assignment"
		}else if (["attr name", "html tag"].includes(prevComponentType) && !(/['"<>=/]/).test(components[i])) {
			prevComponentType = "attr name"
		}else if (prevComponentType === "value assignment" && (/(?:^'.+'$)|(?:^".+"$)|(?:^[^'`"<>=]+$)/).test(components[i])) {
			prevComponentType = "value"
		}else if (prevComponentType === "value" && !(/['"<>=/]/).test(components[i])) {
			prevComponentType = "attr name"
		}else if (i !== components.length-1 || !['>', '/>'].includes(components[i])){
			return false
		}
	}
	return true
}

function getHtmlClosingTagEndPos(startIndex: number, str: string, forbiddenTagNames: string[]) {
	let closingTagMatch = str.slice(startIndex).match(/^<\/[a-zA-z-][a-zA-Z0-9-]*\s*>/);

	if (!closingTagMatch)
		return -1
	else
		return startIndex+closingTagMatch[0].length-1

}

function charEndsTag(partBeingProcessed: string, text: string, charIndex: number, contentEnded: boolean){
	const whitespaceDelimitedParts = ["unquoted val", "tag name", "attr name"];
	let charCanEndTag = false

	if (text[charIndex] === '>') {
		charCanEndTag = true
	}else if (charIndex <= text.length-2 && (text[charIndex] === '/') && (text[charIndex+1] === '>')){
		charCanEndTag = true
	}

	if (charCanEndTag && (whitespaceDelimitedParts.includes(partBeingProcessed) || (partBeingProcessed === "quoted val" && contentEnded))){
		return true
	}

	return false
}

export function getHtmlOpeningTagEndPos(startIndex: number, str: string, forbiddenTagNames: string[]){
	let partBeingProcessed = str[startIndex] // this should be the '<' char
	let contentEnded = false
	let pbpDelimiter = str[startIndex] // this should be the '<' char
	let tagName = ""
	if (partBeingProcessed !== '<')
		return -1

	for (let i=startIndex+1; i<str.length; i++) {
		if (charEndsTag(partBeingProcessed, str, i, contentEnded)) { // implement '/>' later
			if (str[i] === '/')
				return i+1
			return i;
		}

		if (!contentEnded) {
			if (pbpDelimiter === '<'){
				if ((/[a-zA-Z]/).test(str[i])){
					partBeingProcessed = 'tag name'
					pbpDelimiter = ""
				}else return -1
				
			}else if ((!pbpDelimiter && (/\s/).test(str[i])) || (str[i] === pbpDelimiter)) {
				contentEnded = true
				if (partBeingProcessed === "tag name" && forbiddenTagNames.includes(tagName.toLowerCase())){
					return -1
				}
			}else if (partBeingProcessed === "attr name" && str[i] === '=') {
				partBeingProcessed = '='
				contentEnded = true
			}else if (partBeingProcessed === "tag name" && !((/\w|-/).test(str[i]))) {
				return -1
			}else if (partBeingProcessed === "attr name" && !((/[a-zA-Z0-9_:.]/).test(str[i]))) {
				return -1
			}else if (partBeingProcessed === "unquoted val" && (/['"<=]/).test(str[i])) {
				return -1
			}
		}else {
			pbpDelimiter = ""
			contentEnded = false
			if (["attr name", "quoted val", "tag name", "unquoted val"].includes(partBeingProcessed) && (/[a-zA-Z0-9_:]/).test(str[i])) {
				partBeingProcessed = "attr name"
			}else if ((partBeingProcessed === "attr name") && str[i] === '=') {
				partBeingProcessed = "="
			}else if (partBeingProcessed === "=") {
				if (str[i] === '"' || str[i] === "'"){
					pbpDelimiter = str[i]
					partBeingProcessed = "quoted val"
				}else if (!(/[<=>]/).test(str[i])) {
					partBeingProcessed = "unquoted val"
				}else if ((/\S/).test(str[i])) {
					return -1
				}
			}else if ((/\S/).test(str[i])) {
				return -1
			}else {
				contentEnded = true
			}
		}

		if (partBeingProcessed === "tag name" && !contentEnded) {
			tagName	+= str[i]
		}
	}
	return -1
}

function getOtherRawHtmlEndPosition(startIndex: number, text: string) {
	const potHtmlPart = text.slice(startIndex);
	let htmlPatterns = (potHtmlPart.match(/^(<!(?:-{2,3}>))/) || potHtmlPart.match(/^(<!--)(?!(?:>|->))[^]*(?:-->)/) || 
		 potHtmlPart.match(/^(<)!\[CDATA\[[^]+]]>/) || potHtmlPart.match(/^(<)([^<>]+)>/));

	if (!htmlPatterns) {
		return -1
	}/*else if (dangerousHtmlTags.includes(htmlPatterns[1].toLowerCase())) { //abcde
		return null
	}*/
	if (htmlPatterns[1] === "<!--" || htmlPatterns[1] === "<!-->" || htmlPatterns[1] === "<!--->") {
		return startIndex + htmlPatterns[0].length - 1
	}else {
		if (htmlPatterns[1] === "<" && htmlPatterns[0].slice(1, 9) === "![CDATA[" && htmlPatterns[0].slice(htmlPatterns[0].length-3) === "]]>") { // 
			return startIndex + htmlPatterns[0].length - 1
		}else if (htmlPatterns[1] === "<" && htmlPatterns[2][0] === "?") { // ?>
			if (htmlPatterns[0].length > 3 && htmlPatterns[0].slice(htmlPatterns[0].length-2) === "?>")
				return startIndex + htmlPatterns[0].length - 1
			else
				return -1 
		}else if (htmlPatterns[1] === "<" && (/![a-zA-Z]/).test(htmlPatterns[2].slice(0,2))) { // >
			return startIndex + htmlPatterns[0].length - 1
		}else return -1
	}
}

// Validates an html tag and return it's tag end position
export function getHtmlTagEndPos(startIndex: number, str: string, forbiddenTagNames: string[]) {
	// open tag, a closing tag, an HTML comment, a processing instruction, a declaration, or a CDATA section.
	let tagEndPos = getHtmlClosingTagEndPos(startIndex, str, forbiddenTagNames)
	if (tagEndPos > -1)
		return tagEndPos

	tagEndPos = getHtmlOpeningTagEndPos(startIndex, str, forbiddenTagNames)
	if (tagEndPos > -1)
		return tagEndPos
	
	tagEndPos = getOtherRawHtmlEndPosition(startIndex, str)
	if (tagEndPos > -1)
		return tagEndPos
	return tagEndPos
}

/** Generates HTML code element from textStream parameter if it's content conforms to the GFM Code span spec
 * It returns An array of 2 elements where the generated html is the first element and the second element is
 * the index where the codeSpan ends if valid or just where the potential starting delimiter ends if not */
function processPossibleCodeSpan(startIndex: number, textStream: string): [string, number] {
	let startDelimiter = "";
	let backTickBuffer = "";
	let codeSpanEnd = -1;

	for (let i=startIndex; i<textStream.length; i++) {
		if (textStream[i] === '`') {
			backTickBuffer += textStream[i]
			if (i !== textStream.length-1)
				continue;
		}else if (!startDelimiter){
			startDelimiter = backTickBuffer;
			backTickBuffer = "";
		} 

		if (backTickBuffer === startDelimiter) {
			if (i === textStream.length-1 && textStream[i] === '`')
				codeSpanEnd	= i
			else
				codeSpanEnd = i-1; // Code span end index's character has to be a backtick
			break;
		}

		if (backTickBuffer && textStream[i] !== '`') {
			backTickBuffer = "";
		}

		if (textStream[i] === '`' && (i === textStream.length - 1) && !startDelimiter) {
			startDelimiter = backTickBuffer;
		}
	}

	if (codeSpanEnd === -1) { // no closing backtickString delimiter was found
		return ["", startIndex+startDelimiter.length-1]; // - 1 cause startDelimiter's first index is equivalent to startIndex
	}

	let contentStartIndex = startIndex+startDelimiter.length;
	let codeContent = textStream.slice(contentStartIndex, codeSpanEnd-startDelimiter.length+1);
	codeContent = codeContent.replaceAll(/\n|(?:\r\n)/g, ' ');
	if ((/\S/).test(codeContent) && codeContent[0] === ' ' && codeContent[codeContent.length-1] === ' ') { // codeContent has valid leading and trailing spaces
		codeContent = codeContent.slice(1, codeContent.length-1);
	}
	return [`<code>${escapeSpecialCharacters(codeContent)}</code>`, codeSpanEnd];
}

// Adds a new node to or updates an existing Node inside the 
// Linked List containing the special markdown characters and other text as nodes
function addOrUpdateExistingNode(nodeType: string, newContent: string, currentNode: Node, charIndex: number=-1) {
	if (!currentNode.type) { // head node starts of with mostly empty or null attribute values including type
		currentNode.type = nodeType;
		currentNode.content = newContent;
	}else if (currentNode.type !== nodeType || nodeType.startsWith("link marker")) {
		/* Contents of different node type should be put in the same node unless the nodeType is a link marker
		 Link markers have to be in unique nodes because they serve as boundary to basically unprocessed content */
		// console.log(">><<>", newContent)
		currentNode.next = {type: nodeType, closed: true, content: newContent, next: null, prev: currentNode};
		currentNode = currentNode.next;
	}else { // Only contents of the same node type should be put in the same node
		currentNode.content += newContent;
	}
	if (nodeType.startsWith("link marker")) {
		currentNode.closed = false; // For further processing of links
		if (newContent === '['){
		// console.log(charIndex, newContent)
			currentNode.charIndex = charIndex;
		}else if (newContent === '!['){
			currentNode.charIndex = charIndex+1;
		}
	}
	return currentNode;
}

// Returns a string representing the url of a GFM Autolink
function getAutoLinkStr(startIndex: number, text: string) {
	const targetText = text.slice(startIndex)
	let matchedPattern = targetText.match(/<([a-zA-Z][\w+.-]{1,32}:\S*)>/)
	if (matchedPattern) {
		return [matchedPattern[1], "url"]
	}
	matchedPattern = targetText.match(/^<([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)>$/)
	// console.log(matchedPattern)
	if (matchedPattern) {
		return [matchedPattern[1], "email"]
	}
	return [null, ""];
}

/** Processes the textStream after an angle bracket inside the text parameter possibly generating html content
 * if the content processed conforms to any of the GFM specs that starts wwith an angle bracket. It returns An array of 
 * 2 elements where the generated html is the first element and the second element is the index where the processed textStream ends */
function processAngleBracketMarker(text: string, bracketPos: number, forbiddenTagNames: string[]) : [string, number] {
	let htmlTagEndPos = getHtmlTagEndPos(bracketPos, text, forbiddenTagNames);
	if (htmlTagEndPos > -1) {
		return [text.slice(bracketPos, htmlTagEndPos + 1), htmlTagEndPos]; // come back to escape
	}
	let [address, type] = getAutoLinkStr(bracketPos, text);
	if (type === "url") {
		let rawHtml = `<a href="${encodeURI(escapeSpecialCharacters(parseCharRef(address)))}">${escapeSpecialCharacters(address)}</a>`;
		return [rawHtml, bracketPos+address.length+1]; // bracketPos+url.length+1 : zero based addition ( + the 2 angle brackets acting as boundary for the autolink)
	}else if (type === "email") {
		let rawHtml = `<a href="mailto:${encodeURI(escapeSpecialCharacters(parseCharRef(address)))}">${address}</a>`;
		return [rawHtml, bracketPos+address.length+1]; // bracketPos+url.length+1 : zero based addition ( + the 2 angle brackets acting as boundary for the autolink)
	}
	let matchedPattern = text.slice(bracketPos).match(/<!--(?!(?:>|->))[^]*-->/)
	if (matchedPattern) {
		return [matchedPattern[0], matchedPattern[0].length-1]
	}
	return [null, -1]
}

export function getEscapedForm(char: string): string {
	switch(char) {
		case "<":
			return "&lt;"
		case '>':
			return "&gt;"
		// case "'":
		// 	return "&apos;";
		case '"':
			return "&quot;"
		// case '(':
		// 	return "&lpar;";
		// case ')':
		// 	return "&rpar;";
		case '&':
			return "&amp;"
		default:
			return char
	}
}


/** Returns the head of a Linked list containing plain text and special inline markdown characters as nodes
 * The linked list will be generated from the text parameter */
function generateLinkedList(text: string, dangerousHtmlTags: string[], linkRefs: LinkRefDataMap) {
	const head:Node = {type: "", closed: false, content: "", next: null, prev: null}
	let currNode = head;
	let charIsEscaped = false;
	let i=0;
	let adjSpaceCharCount = 0; // adjacent space character count

	while (i < text.length){
		// console.log([text, text[i]])
		if (text[i] === '\n' && (charIsEscaped || (adjSpaceCharCount >= 2)) && i !== text.length-1) { // a hard line break is found
			if (adjSpaceCharCount >= 2){
				// remove the spaces representing the hardline break
				let contentEnd = currNode.content.length - adjSpaceCharCount;
				currNode.content = currNode.content.slice(0, contentEnd)
			}else if (charIsEscaped) {
				charIsEscaped = false;
			}
			currNode = addOrUpdateExistingNode("raw html", "<br />\n", currNode);
		}else if (charIsEscaped && PUNCTUATIONS.includes(text[i])) { //  && text[i] !== '|'
			// all punctuations are escapable here except '|' that may be part of a table's syntax
			let replacement = getEscapedForm(text[i]);
			currNode = addOrUpdateExistingNode("text content", replacement, currNode);
			charIsEscaped = false;
		}else if (text[i] === '\\' && i !== text.length-1){
		// backslash indicates an escape sequence if it doesn't occur at the end of a textStream
			charIsEscaped = true;
		}else if (text[i] === '<') {
			const [content, contentEndIndex] = processAngleBracketMarker(text, i, dangerousHtmlTags);
			if (content) {
				i = contentEndIndex;
				currNode = addOrUpdateExistingNode("raw html", content, currNode);
			}else {
				currNode = addOrUpdateExistingNode("text content", "&lt;", currNode);
			}
		}else if (text[i] === '`') {
			const [codeSpan, syntaxEnd] = processPossibleCodeSpan(i, text);
			if (codeSpan) {
				currNode = addOrUpdateExistingNode("raw html complete", codeSpan, currNode);
			}else currNode = addOrUpdateExistingNode("text content", text.slice(i, syntaxEnd+1), currNode);
			i = syntaxEnd;
		}else if (text[i] === '>') {
			// escape '>' characters that are not part of any other node
			currNode = addOrUpdateExistingNode("text content", "&gt;", currNode);
		}else if (text[i] === '"') {
			// escape '>' characters that are not part of any other node
			currNode = addOrUpdateExistingNode("text content", "&quot;", currNode);
		}else if (text[i] === '!' && ((i+1)<text.length && text[i+1]==='[')){ // img link start marker
			currNode = addOrUpdateExistingNode("link marker start", "![", currNode, i);
			i += 2; continue;
		}else if (text[i] === '[') { // normal link end marker
			currNode = addOrUpdateExistingNode("link marker start", text[i], currNode, i);
		}else if (text[i] === ']') { // any link end marker
			currNode = addOrUpdateExistingNode("link marker end", text[i], currNode);
			const [newNode, endIndex] = generateLinkHtmlNode(text, currNode, linkRefs, i)
			if (newNode) {
				currNode = newNode;
				i = endIndex;
			}
		}else if (text[i] === '*' || text[i] === '_') { // markdown's emphasis and strong html elements representations
			currNode = addOrUpdateExistingNode("pot delimiter run", text[i], currNode);
			// console.log(currNode)
			setAsLeftOrRightFlanking(currNode, text, i);
		}else {
			if (charIsEscaped) { // The escaped character didn't turn out to be a special character in this context
				currNode = addOrUpdateExistingNode("text content", '\\', currNode) // backslash should be used literally for now
			}
			currNode = addOrUpdateExistingNode("text content", text[i], currNode);
			charIsEscaped = false 
		}
		if (text[i] === ' ')
			adjSpaceCharCount++
		else adjSpaceCharCount = 0;
		i++;
	}
	return head;
}


function getCharRefIfValid(text: string, index: number) { // Still need to do decimal and hexadecimal references
	let ref = ""

	for (let i=index+1; i<text.length; i++) {
		if ((/\s|&/).test(text[i])){ // html entities don't contain ampersands or whitespace
			return '';
		}else if (text[i] === ';') {
			break;
		}else if (i === text.length-1) {
			ref = "";
			break;
		}
		ref += text[i];
	}
	return ref;
}


/*
parse character refs (raw html and every code span/block is excluded)
finally, always replace quote, ampersand and '<' (raw html is excluded)
*/
export function parseCharRef(textStream: string) {
	let output = "", i=0;
	while (i < textStream.length) {
		if (textStream[i] === '&') {
			const charRef = getCharRefIfValid(textStream, i)
			// console.log(charRef)
			if (charRef) {
				try {
					// todo: Add proper library for parsing character references
					if ((/^#\d{1,7}$/).test(charRef)){
						const codePoint = charRef.slice(1)
						// output += getEscapedForm(String.fromCodePoint(parseInt(codePoint))) // unicode character
						output += String.fromCodePoint(parseInt(codePoint)) // unicode character
					}else if ((/^#(?:x|X)[a-fA-F0-9]{1,6}$/).test(charRef)) {
						const codePoint = charRef.slice(1)
						// output += getEscapedForm(String.fromCodePoint(parseInt('0' + codePoint))) // unicode character
						output += String.fromCodePoint(parseInt('0' + codePoint)) // unicode character
					}else if (validEntityRefs['&'+charRef+';']) { //
						// output += getEscapedForm(String.fromCodePoint(validEntityRefs['&'+charRef+';']["codepoints"][0])) // unicode character
						output += String.fromCodePoint(validEntityRefs['&'+charRef+';']["codepoints"][0]) // unicode character
					}else {
						throw("Range Error")
						// output += "&amp;"
					}
					i += charRef.length + 2; // We want parsing to continue after the semi colon that ends the refernce
					continue;
				}catch(err) { // Range Error
					// textStream += "&amp;"
				}
			}
		}
		output += textStream[i];
		i++;
	}

	return output
}


// Returns the concatenated content of all nodes in the linked list as one string
export function convertLinkedListToText(head: Node) {
	let currentNode = head;
	let outputText = ""
	while (true) {
		if (currentNode.type === "text content")
			outputText += escapeSpecialCharacters(parseCharRef(currentNode.content))
		else
			outputText += currentNode.content;
		if (!currentNode.next) {
			break;
		}
		currentNode = currentNode.next;
	}
	return outputText;
}

export default function parseInlineNodes(text: string, linkRefs: LinkRefDataMap, dangerousHtmlTags: string[]): string {
	// console.log(text)
	let listHead = generateLinkedList(text, dangerousHtmlTags, linkRefs);
	generateEmNodes(listHead);
	return convertLinkedListToText(listHead);
}