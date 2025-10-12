import generateEmNodes, { setAsLeftOrRightFlanking } from "./emphasisGenerator"
import type { LinkRefData, LinkRefDataMap } from "./linkGenerator"
import { generateLinkHtmlNode } from "./linkGenerator"
const validEntityRefs = require('../entities.json')

export const PUNCTUATIONS = "<>;,.()[]{}!`~+-_!=*&^%$#@\\/\"':?~|";

export interface Node {
	content: string;
	type: string;
	next: Node|null;
	prev: Node|null;
	charIndex?: number;
}

/** Replaces special characters in a string with their html entities
 * @returns {string} - the new string */
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

/** Gets the index where a '>' character ends an Html closing tag
 * @param {number} startIndex - Index where the closing tag starts in a string
 * @param {string} str - String containing the closing tag
 * @param {string[]} forbiddenTagNames - array of strings containing tag names that would be considered dangerous html 
 * @returns {number} - The index where the closing tag ends or -1 if it doesn't */
function getHtmlClosingTagEndPos(startIndex: number, str: string, forbiddenTagNames: string[]) {
	let closingTagMatch = str.slice(startIndex).match(/^<\/[a-zA-z-][a-zA-Z0-9-]*\s*>/);

	if (!closingTagMatch)
		return -1
	else
		return startIndex+closingTagMatch[0].length-1

}


/** Determines if a character in a string containing an html opening tag will end the tag or not
 * @param {string} partBeingProcessed - string representing the part of the tag where the character is found. Must be 'tag name', 'attr name', 'unquoted val' or 'quoted val'
 * @param {string} text - String containing the opening tag
 * @param {number} charIndex - Index of the character that's to be checked
 * @param {boolean} contentEnded - Indicates if we are beyond the end of the content of `partBeingProcessed` while processing
 * @param {string[]} forbiddenTagNames - array of strings containing tag names that would be considered dangerous html 
 * @returns {boolean} - true if the character ends the tag, false if not*/
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

/** Gets the index where a '>' character ends a Html opening tag
 * @param {number} startIndex - Index where the opening tag starts in a string
 * @param {string} str - String containing the opening tag
 * @param {string[]} forbiddenTagNames - array of strings containing tag names that would be considered dangerous html 
 * @returns {number} - The index where the closing tag ends or -1 if it doesn't */
export function getHtmlOpeningTagEndPos(startIndex: number, str: string, forbiddenTagNames: string[]){
	let partBeingProcessed = str[startIndex] // this should be the '<' char
	let contentEnded = false
	let pbpDelimiter = str[startIndex] // partBeingProcessed delimiter. This should be the '<' char
	let tagName = ""
	const whiteSpaceMargin = " \t\n"

	if (partBeingProcessed !== '<')
		return -1

	for (let i=startIndex+1; i<str.length; i++) {
		if (charEndsTag(partBeingProcessed, str, i, contentEnded)) {
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
			if (["attr name", "quoted val", "tag name", "unquoted val"].includes(partBeingProcessed) && (/[a-zA-Z0-9_:]/).test(str[i]) && whiteSpaceMargin.includes(str[i-1])) {
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

/** Gets the index where a '>' character ends unconventional Html tags namely comments, processing instructions, 
 * declarations and CDATA sections. These tags are parsed according to the commonmark spec
 * @param {number} startIndex - Index where the closing tag starts in a string
 * @param {string} text - String containing the closing tag
 * @returns {number} - The index where the closing tag ends or -1 if it doesn't */
function getOtherRawHtmlEndPosition(startIndex: number, text: string) {
	const potHtmlPart = text.slice(startIndex); // potential Html part
	let htmlPatterns = (potHtmlPart.match(/^(<!(?:-{2,3}>))/) || potHtmlPart.match(/^(<!--)(?!(?:>|->))[^]*(?:-->)/) || 
		 potHtmlPart.match(/^(<)!\[CDATA\[[^]+]]>/) || potHtmlPart.match(/^(<)([^<>]+)>/));

	if (!htmlPatterns) {
		return -1
	}
	if (htmlPatterns[1] === "<!--" || htmlPatterns[1] === "<!-->" || htmlPatterns[1] === "<!--->") {
		return startIndex + htmlPatterns[0].length - 1
	}else {
		if (htmlPatterns[1] === "<" && htmlPatterns[0].slice(1, 9) === "![CDATA[" && htmlPatterns[0].slice(htmlPatterns[0].length-3) === "]]>") { // CDATA section
			return startIndex + htmlPatterns[0].length - 1
		}else if (htmlPatterns[1] === "<" && htmlPatterns[2][0] === "?") { // processing instructions
			if (htmlPatterns[0].length > 3 && htmlPatterns[0].slice(htmlPatterns[0].length-2) === "?>")
				return startIndex + htmlPatterns[0].length - 1
			else
				return -1 
		}else if (htmlPatterns[1] === "<" && (/![a-zA-Z]/).test(htmlPatterns[2].slice(0,2))) { // declarartiom
			return startIndex + htmlPatterns[0].length - 1
		}else return -1
	}
}


/** Gets the index where a '>' character ends unconventional Html tags namely comments, processing instructions, 
 * declarations and CDATA sections. All these tags are parsed according to the commonmark spec
 * @param {number} startIndex - Index where the closing tag starts in a string
 * @param {string} text - String containing the closing tag
 * @returns {number} - The index where the closing tag ends or -1 if it doesn't */
export function getHtmlTagEndPos(startIndex: number, str: string, forbiddenTagNames: string[]) {
	let tagEndPos = getHtmlClosingTagEndPos(startIndex, str, forbiddenTagNames)
	if (tagEndPos > -1)
		return tagEndPos

	tagEndPos = getHtmlOpeningTagEndPos(startIndex, str, forbiddenTagNames)
	if (tagEndPos > -1)
		return tagEndPos
	
	tagEndPos = getOtherRawHtmlEndPosition(startIndex, str) // HTML comment, a processing instruction, a declaration, or a CDATA section.
	if (tagEndPos > -1)
		return tagEndPos
	return tagEndPos
}

/** Generates HTML code element from textStream parameter if it's content conforms to the CommonMark Code span spec
 * @param {number} startIndex - The index where the code span delimiter starts
 * @param {string} textStream - The string containing the code span
 * @returns {(string|number)[]} - An array of 2 elements where the generated html is the first element and the second element is
 * 								the index where the codeSpan ends if valid or just where the potential starting delimiter ends if not */
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
		return ["", startIndex+startDelimiter.length-1]; // - 1 cause startDelimiter's first character index is equivalent to startIndex
	}

	let contentStartIndex = startIndex+startDelimiter.length;
	let codeContent = textStream.slice(contentStartIndex, codeSpanEnd-startDelimiter.length+1);
	codeContent = codeContent.replaceAll(/\n|(?:\r\n)/g, ' ');
	if ((/\S/).test(codeContent) && codeContent[0] === ' ' && codeContent[codeContent.length-1] === ' ') { // codeContent has leading and trailing spaces
		codeContent = codeContent.slice(1, codeContent.length-1);
	}
	return [`<code>${escapeSpecialCharacters(codeContent)}</code>`, codeSpanEnd];
}



/** A node of the Linked List generated when parsing inline nodes when parsing the text
 * @typedef {Object} Node
 * @property {string} nodeType - string representing the type of node
 * @property {string} content - plain text content of the node
 * @property {null|Node} next - The next node in the linked list or null if this is the list's tail
 * @property {null|Node} prev - The previous node in the linked list or null if this is the list's head */


/** Adds a new node to or updates an existing Node inside the Linked List 
 * containing the special inline markdown characters and other text as nodes
 * @param {string} nodeType - The type of node to be created or updated
 * @param {string} newContent - The text to be added to the new or existing node
 * @param {Node} currentNode - The node whose content will be updated or that will serve as the predecessor to the newly created node
 * @param {number} [charIndex=-1] - Start index of the new text to be added in the text stream being parsed
 * @returns {Node} - The node created or updated */
function addOrUpdateExistingNode(nodeType: string, newContent: string, currentNode: Node, charIndex: number=-1) {
	if (!currentNode.type) { // head node starts with mostly empty or null attribute values including type
		currentNode.type = nodeType;
		currentNode.content = newContent;
	}else if (currentNode.type !== nodeType || nodeType.startsWith("link marker")) {
		/* Contents of different node type should be put in different nodes unless the nodeType is a link marker
		 Link markers have to be in unique nodes because they serve as boundary to basically unprocessed content */
		currentNode.next = {type: nodeType, content: newContent, next: null, prev: currentNode};
		currentNode = currentNode.next;
	}else { // Only contents of the same node type should be put in the same node
		currentNode.content += newContent;
	}
	if (nodeType.startsWith("link marker")) {
		if (newContent === '['){
			currentNode.charIndex = charIndex; // text end index in the textstream being parsed. It will be used when getting link labels
		}else if (newContent === '!['){
			currentNode.charIndex = charIndex+1; // text end index in the textstream being parsed. It will be used when getting link labels
		}
	}
	return currentNode;
}


/** Gets the string representing the address of a valid CommonMark Autolink
 * @param {number} startIndex - Index where the autolink starts in the string
 * @param {string} text - String containing autolink
 * @returns {string[]} - The first element is the address of the autolink while the second element is the type of address (email or url).
 * The first element of the array will be null if the autolink is invalid  */
function getAutoLinkStr(startIndex: number, text: string) {
	const targetText = text.slice(startIndex)
	let matchedPattern = targetText.match(/<([a-zA-Z][\w+.-]{1,32}:\S*)>/)
	if (matchedPattern) {
		return [matchedPattern[1], "url"]
	}
	matchedPattern = targetText.match(/^<([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)>$/)
	if (matchedPattern) {
		return [matchedPattern[1], "email"]
	}
	return [null, ""];
}

/** Determines if an angle bracket is part of a valid html tag or autolink according to the commonmark spec
 * @param {string} text - String containing the the angle bracket
 * @param {number} bracketPos - index of the angle bracket in the text
 * @param {string[]} forbiddenTagNames - array of tag names that would make the html tag invalid.
 * @returns {(string|number)[]} - An array of 2 elements where the generated html is the first element and the 
 * second element is the end index in the textStream. The first element will be null if the html is invalid */
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
	return [null, -1]
}

/** Gets the html entity reference of some select characters ('<', '>', '"', '&')
 * @param {string} char - character whose html entity reference is needed
 * @returns {string} - The html character entity reference for the character or the character itself*/
export function getEscapedForm(char: string): string {
	switch(char) {
		case "<":
			return "&lt;"
		case '>':
			return "&gt;"
		case '"':
			return "&quot;"
		case '&':
			return "&amp;"
		default:
			return char
	}
}

/** Creates a Linked list whose nodes' content are special inline markdown characters and 
 * plain text that have been seperated from each other
 * @param {string} text - the text from which we are to generate the linked list
 * @param {string[]} dangerousHtmlTags - list of tag names that would make any html tag invalid
 * @returns {Node} - the head node of the linked list */
function generateLinkedList(text: string, dangerousHtmlTags: string[], linkRefs: LinkRefDataMap) {
	const head:Node = {type: "", content: "", next: null, prev: null}
	let currNode = head;
	let charIsEscaped = false;
	let i=0;
	let adjSpaceCharCount = 0; // adjacent space character count

	while (i < text.length){
		if (text[i] === '\n' && (charIsEscaped || (adjSpaceCharCount > 0))) { // a hard line break is found
			if (adjSpaceCharCount == 1){
				currNode.content = currNode.content.slice(0, currNode.content.length-1)
			}else{
				// remove the spaces representing the hardline break
				let contentEnd = currNode.content.length - adjSpaceCharCount;
				currNode.content = currNode.content.slice(0, contentEnd)
				if (charIsEscaped) 
					charIsEscaped = false;
				currNode = addOrUpdateExistingNode("raw html", "<br />", currNode);
			}
			currNode = addOrUpdateExistingNode("text content", "\n", currNode);
		}else if (charIsEscaped && PUNCTUATIONS.includes(text[i])) { //  && text[i] !== '|'
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


function getCharRefIfValid(text: string, index: number) {
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


/** Replaces any valid entity and numeric character references in a text
 * @param {string} textStream - The text whose character references are to be replaced if any
 * @returns {string} - A new string where all the valid character references have been replaced */
export function parseCharRef(textStream: string) {
	let output = "", i=0;
	while (i < textStream.length) {
		if (textStream[i] === '&') {
			const charRef = getCharRefIfValid(textStream, i)

			if (charRef) {
				try {
					// todo: Add proper library for parsing character references
					if ((/^#\d{1,7}$/).test(charRef)){
						const codePoint = charRef.slice(1)
						output += String.fromCodePoint(parseInt(codePoint)) // unicode character
					}else if ((/^#(?:x|X)[a-fA-F0-9]{1,6}$/).test(charRef)) {
						const codePoint = charRef.slice(1)
						output += String.fromCodePoint(parseInt('0' + codePoint)) // unicode character
					}else if (validEntityRefs['&'+charRef+';']) { //
						output += String.fromCodePoint(validEntityRefs['&'+charRef+';']["codepoints"][0]) // unicode character
					}else {
						throw("Range Error")
					}
					i += charRef.length + 2; // We want parsing to continue after the semi colon that ends the reference
					continue;
				}catch(err) { // Range Error
					output += textStream[i];
					i++;
					continue;
				}
			}
		}
		output += textStream[i];
		i++;
	}

	return output
}


/** Concatenates the text content of all the nodes in a linked list. Nodes with a type attribute of "text content" 
 * would be processed for html character references and any unescaped special characters before adding thier text content
 * @param {Node} head - The head of the linked list node
 * @returns {string} - The concatenated text content of all nodes */
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


/** Converts any valid commonmark special inline characters into their appropriate html tags
 * @param {string} text - The string to be parsed
 * @param {Object} linkRefsMap -  Dictionary mapping link labels to link attributes from commonmark link reference definitions 
 * @param {string[]} dangerousHtml - List of html tag names whose tags we don't want as part of output when parsing the text*/
export default function parseInlineNodes(text: string, linkRefs: LinkRefDataMap, dangerousHtmlTags: string[]): string {
	let listHead = generateLinkedList(text, dangerousHtmlTags, linkRefs);
	generateEmNodes(listHead);
	return convertLinkedListToText(listHead);
}