import generateEmNodes, { setAsLeftOrRightFlanking } from "./emphasisGenerator"
import type { LinkRef } from "./linkGenerator"
import { generateLinkHtmlNode } from "./linkGenerator"
import { escapeSpecialCharacters } from "../htmlGenerator"

export const PUNCTUATIONS = "<>;,.()[]{}!`~+-*&^%$#@\\/\"':?~|"; // is this all the possible punctuations?

export interface Node {
	content: string;
	type: string;
	closed: boolean;
	next: Node|null;
	prev: Node|null;
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

// Validates an html tag and return it's tag end position
export function getHtmlTagEndPos(startIndex: number, str: string, forbiddenTagNames: string[]) {
	const htmlComponents: string[] = []
	let currentComponent = "";
	let currentComponentType = "tag"
	let tagEndPos = -1;
	let tagName = "";
	const closingTagPattern = str.slice(startIndex).match(/^<\/\w+\s*>/);

	if (closingTagPattern) { // The type of tag is a html closing tag
		tagName = closingTagPattern[0].slice(2, closingTagPattern[0].length-1).toLowerCase();
		// 1st condition: An ASCII alphabet must start an html tag as per gfm spec
		if (!(/[a-zA-Z]/).test(str[startIndex+2]) || forbiddenTagNames.includes(tagName)) {
			return -1;
		}
		return startIndex + closingTagPattern[0].length - 1;
	}

	// The tag would be processed as if it's a html opening tag
	// The loop below attempts to split the tag into it's component parts
	for (let i=startIndex; i<str.length; i++) {
		if (currentComponent && ['"', "'"].includes(currentComponent[0])) { // currentComponent is an html quoted value
			let lastIndex = currentComponent.length - 1;
			if (currentComponent.length === 1 || currentComponent[0] !== currentComponent[lastIndex]) {
				currentComponent += str[i];
				continue;
			}
		}

		let charIsWhiteSpace = (/\s/).test(str[i]);
		if (charIsWhiteSpace && currentComponent) {
			htmlComponents.push(currentComponent);
			currentComponent = ""
		}else if (str[i] === '=' && currentComponent){
			htmlComponents.push(currentComponent);
			currentComponent = ""
		}else if (str[i] === '>') {
			if (!currentComponent) {
				htmlComponents.push(str[i]);
			}else if (currentComponent === '/') {
				htmlComponents.push(currentComponent+str[i]);
			}else {
				htmlComponents.push(currentComponent, str[i]);
			}
			tagEndPos = i;
			break;
		}else if (currentComponent === '=') {
			htmlComponents.push(currentComponent);
			currentComponent = ""
		}

		if (!charIsWhiteSpace) {
			currentComponent += str[i];
		}
		
	}

	tagName = htmlComponents[0].slice(1).toLowerCase();
	if (tagEndPos === -1 || forbiddenTagNames.includes(tagName) || !isValidHtmlTag(htmlComponents)){
		return -1
	}else {
		return tagEndPos;
	}
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
		}else if (!startDelimiter){
			startDelimiter = backTickBuffer;
		}else if (backTickBuffer === startDelimiter) {
			codeSpanEnd = i-1; // Code span end index's character has to be a backtick
			break;
		}

		if (backTickBuffer && textStream[i] !== '`') {
			backTickBuffer = "";
		}

		if (textStream[i] === '`' && (i === textStream.length - 1) && startDelimiter) {
			codeSpanEnd = i;
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
	return [`<code>${codeContent}</code>`, codeSpanEnd];
}

// Adds a new node to or updates an existing Node inside the 
// Linked List containing the special markdown characters and other text as nodes
function addOrUpdateExistingNode(nodeType: string, newContent: string, currentNode: Node) {
	if (!currentNode.type) { // head node starts of with mostly empty or null attribute values including type
		currentNode.type = nodeType;
		currentNode.content = newContent;
	}else if (currentNode.type !== nodeType || nodeType.startsWith("link marker")) {
		/* Contents of different node type should be put in the same node unless the nodeType is a link marker
		 Link markers have to be in unique nodes because they serve as boundary to basically unprocessed content */
		currentNode.next = {type: nodeType, closed: true, content: newContent, next: null, prev: currentNode};
		currentNode = currentNode.next; 
	}else { // Only contents of the same node type should be put in the same node
		currentNode.content += newContent;
	}
	if (nodeType.startsWith("link marker")) {
		currentNode.closed = false; // For further processing of links
	}
	return currentNode;
}

// Returns a string representing the url of a GFM Autolink
function getAutoLinkStr(startIndex: number, text: string) {
	let matchedPattern = text.slice(startIndex).match(/<([a-zA-Z][\w+.-]{1,32}:\S*)>/)
	if (!matchedPattern) {
		return "";
	}
	return matchedPattern[1];
}

/** Processes the textStream after an angle bracket inside the text parameter possibly generating html content
 * if the content processed conforms to any of the GFM specs that starts wwith an angle bracket. It returns An array of 
 * 2 elements where the generated html is the first element and the second element is the index where the processed textStream ends */
function processAngleBracketMarker(text: string, bracketPos: number, forbiddenTagNames: string[]) : [string, number] {
	let htmlTagEndPos = getHtmlTagEndPos(bracketPos, text, forbiddenTagNames);
	if (htmlTagEndPos > -1) {
		return [text.slice(bracketPos, htmlTagEndPos + 1), htmlTagEndPos];
	}
	let url = getAutoLinkStr(bracketPos, text);
	if (url) {
		let rawHtml = `<a href="${url}">${url}</a>`;
		return [rawHtml, bracketPos+url.length+1]; // bracketPos+url.length+1 : zero based addition ( + the 2 angle brackets acting as boundary for the autolink)
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
		case "'":
			return "&apos;";
		case '"':
			return "&quot;"
		case '(':
			return "&lpar;";
		case ')':
			return "&rpar;";
		case '&':
			return "&amp;"
		default:
			return char
	}
}


/** Returns the head of a Linked list containing plain text and special inline markdown characters as nodes
 * The linked list will be generated from the text parameter */
function generateLinkedList(text: string, dangerousHtmlTags: string[], linkRefs: LinkRef[]) {
	const head:Node = {type: "", closed: false, content: "", next: null, prev: null}
	let currNode = head;
	let charIsEscaped = false;
	let i=0;
	let adjSpaceCharCount = 0; // adjacent space character count

	while (i < text.length){
		if (text[i] === '\n' && (charIsEscaped || (adjSpaceCharCount >= 2)) && i !== text.length-1) { // we found an hard line break
			if (adjSpaceCharCount >= 2){
				// remove the spaces representing the hardline break
				let contentEnd = currNode.content.length - adjSpaceCharCount;
				currNode.content = currNode.content.slice(0, contentEnd)
			}else if (charIsEscaped) {
				charIsEscaped = false;
			}
			currNode = addOrUpdateExistingNode("raw html", "<br/>", currNode);
		}else if (charIsEscaped && PUNCTUATIONS.includes(text[i]) && text[i] !== '|') {
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
				currNode = addOrUpdateExistingNode("raw html", codeSpan, currNode);
			}else currNode = addOrUpdateExistingNode("text content", text.slice(i, syntaxEnd+1), currNode);
			i = syntaxEnd;
		}else if (text[i] === '>') {
			// escape '>' characters that are not part of any other node
			currNode = addOrUpdateExistingNode("text content", "&gt;", currNode);
		}else if (text[i] === '!' && ((i+1)<text.length && text[i+1]==='[')){ // img link start marker
			currNode = addOrUpdateExistingNode("link marker start", "![", currNode);
			i += 2; continue;
		}else if (text[i] === '[') { // normal link end marker
			currNode = addOrUpdateExistingNode("link marker start", text[i], currNode);
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

// Returns the concatenated content of all nodes in the linked list as one string
export function convertLinkedListToText(head: Node) {
	let currentNode = head;
	let outputText = ""
	while (true) {
		outputText += currentNode.content;
		if (!currentNode.next) {
			break;
		}
		currentNode = currentNode.next;
	}
	return outputText;
}

export default function parseInlineNodes(text: string, linkRefs: LinkRef[], dangerousHtmlTags: string[]): string {
	let listHead = generateLinkedList(text, dangerousHtmlTags, linkRefs);
	generateEmNodes(listHead);
	return convertLinkedListToText(listHead);
}