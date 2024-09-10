import generateLinkNodes from "./linkGenerator"
import generateEmNodes, { setAsLeftOrRightFlanking } from "./emphasisGenerator"
import type { LinkRef } from "../htmlGenerator"

export const PUNCTUATIONS = "<>;,.()[]{}!`~+-*&^%$#@\\/\"':?~|"; // is this all the possible punctuations?

export interface Node {
	content: string;
	type: string;
	closed: boolean;
	next: Node|null;
	prev: Node|null;
}

export function getAutoLinkStr(startIndex: number, text: string) {
	let matchedPattern = text.slice(startIndex).match(/<[a-zA-Z]{2,32}:\S*>/)
	if (!matchedPattern) {
		return "";
	}
	return matchedPattern[0];
}

// gets the end index of an html tag
// Perhaps, It could be done better with the kmp or boyer-moore algorithm if only I knew how to implement them
export function getHtmlTagEndPos(tagStartIndex: number, str: string): number {
	let currTokenType = "";
	let lastToken = ""
	let attrValueFirstChar = ""; // HTML attribute value first character
	for (let i=tagStartIndex+1; i<str.length; i++) {
		if ((i==tagStartIndex+1) && !(/[a-zA-Z]/).test(str[i])) { // An ASCII alphabet must start an html tag
			return -1
		}else {
			currTokenType = "tag name"
		}

		if ((currTokenType === "" || currTokenType === "white space") && str[i] === '>') {
			return i;
		}

		if (currTokenType === "attr value" && ('"\'').includes(attrValueFirstChar)) { // html attribute quoted value
			if (str[i] === attrValueFirstChar && ( (i+1 === str.length) || !(" />").includes(str[i+1])) ) {
				// syntax violates html syntax spec which states quoted attribute values must be seperated from a new attribute by whitespace
				return -1;
			}else currTokenType = "";
		}

		if ((/\s/).test(str[i]) && currTokenType !== "white space") {
			lastToken = currTokenType;
			currTokenType = "white space";			
		}else if (!(/\s/).test(str[i]) && currTokenType === "white space") {
			if (str[i] === "/") {
				currTokenType = "solidus"
			}else if (lastToken === "tag name" || lastToken === "attr name") {
				if ( ("<>\"'=").includes(str[i]) ) {
					return -1;
				}else currTokenType = "attr name"
			}else if (lastToken === "attr name" && str[i] === '=') {
				currTokenType = "value specifier"
				continue; // prevents lastToken from becoming a null string
			}else if (lastToken === "value specifier") {
				currTokenType = "attr value"
			}
			lastToken = "";
		}
	}
	return -1;
}


function processPossibleCodeSpan(startIndex: number, textStream: string): [string, number] {
	let startDelimiter = "";
	let potEndDelimiter = ""; // potential end delimiter
	let contentStartIndex = -1;
	let contentEndIndex = -1;
	let codeSpanEndIndex = -1;

	for (let i=startIndex; i<textStream.length; i++) {
		if (textStream[i] !== '`' && !startDelimiter) {
			startDelimiter = textStream.slice(startIndex, i);
			contentStartIndex = i;
		}else if (textStream[i] === '`' && startDelimiter) {
			potEndDelimiter += textStream[i];
		}
		if (potEndDelimiter && (i==textStream.length-1 || textStream[i+1] !== '`')) {
			if (potEndDelimiter === startDelimiter) {
				codeSpanEndIndex = i;
				contentEndIndex = i-potEndDelimiter.length;
				break;
			}else potEndDelimiter = "";
		}

		if (i === textStream.length - 1) {
			if (!startDelimiter) {
				return ["", startIndex];
			}
			return ["", startIndex+startDelimiter.length-1]; // - 1 cause startDelimiter's first index is equivalent to startIndex
		}
	}
	let codeContent = textStream.slice(contentStartIndex, contentEndIndex+1);
	codeContent = codeContent.replaceAll(/\n|(?:\r\n)/g, ' ');
	if ((/\S/).test(codeContent) && codeContent[0] === ' ' && codeContent[codeContent.length-1] === ' ') {
		codeContent = codeContent.slice(1, codeContent.length-1);
	}
	return [`<code>${codeContent}</code>`, codeSpanEndIndex];
}

function addOrUpdateExistingNode(nodeType: string, newContent: string, currentNode: Node) {
	if (!currentNode.type) { // head node
		currentNode.type = nodeType;
		currentNode.content = newContent;
	}else if (currentNode.type !== nodeType || nodeType.startsWith("link marker")) {
		currentNode.next = {type: nodeType, closed: true, content: newContent, next: null, prev: currentNode};
		currentNode =	currentNode.next; 
	}else {
		currentNode.content += newContent;
	}
	if (nodeType.startsWith("link marker")) {
		currentNode.closed = false;
	}
	return currentNode;
}

function processAngleBracketMarker(text: string, bracketPos: number, currentNode: Node) {
	let htmlTagEndPos = getHtmlTagEndPos(bracketPos, text);
	if (htmlTagEndPos > -1) {
		currentNode = addOrUpdateExistingNode("raw html", text.slice(bracketPos, htmlTagEndPos + 1), currentNode)
		return [currentNode, htmlTagEndPos+1]
	}
	let autoLinkStr = getAutoLinkStr(bracketPos, text);
	if (autoLinkStr) {
		let rawHtml = `<a href="${autoLinkStr}">${autoLinkStr}</a>`;
		currentNode = addOrUpdateExistingNode("raw html", rawHtml, currentNode)
		return [currentNode, autoLinkStr.length-1] // 1 is subtracted since it's zero based
	}
	let matchedPattern = text.slice(bracketPos).match(/<!--(?!(?:>|->))[^]*-->/)
	if (matchedPattern) {
		currentNode = addOrUpdateExistingNode("raw html", matchedPattern[0], currentNode);
		return [currentNode, matchedPattern[0].length-1]
	}
	return [];
}

function getEscapedForm(char: string): string {
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
		default:
			return char
	}
}

// TODO: maybe implement hard line break
function generateLinkedList(text: string) {
	const head:Node = {type: "", closed: false, content: "", next: null, prev: null}
	let currNode = head;
	let charIsEscaped = false;
	let i=0;

	while (i < text.length){
		if (charIsEscaped && PUNCTUATIONS.includes(text[i])) {
			let replacement = getEscapedForm(text[i]);
			currNode = addOrUpdateExistingNode("text content", replacement, currNode);
			charIsEscaped = false;
		}else if (text[i] === '\\'){
			charIsEscaped = true;
		}else if (text[i] === '<') {
			const processedChanges = processAngleBracketMarker(text, i, currNode)
			if (processedChanges.length !== 0) {
				currNode = processedChanges[0] as Node;
				i = processedChanges[1] as number;
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
			currNode = addOrUpdateExistingNode("text content", "&gt;", currNode);
		}else if (text[i] === '[') {
			currNode = addOrUpdateExistingNode("link marker start", text[i], currNode);
		}else if (text[i] === ']') {
			currNode = addOrUpdateExistingNode("link marker end", text[i], currNode);
		}else if (text[i] === '*' || text[i] === '_') {
			currNode = addOrUpdateExistingNode("pot delimiter run", text[i], currNode);
			setAsLeftOrRightFlanking(currNode, text, i);
		}else {
			currNode = addOrUpdateExistingNode("text content", text[i], currNode);
			charIsEscaped = false // incase
		}
		i++;
	}
	return head;
}

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

export default function parseInlineNodes(text: string, linkRefs: LinkRef[]): string {
	let listHead = generateLinkedList(text);
	generateLinkNodes(listHead, linkRefs);
	generateEmNodes(listHead);
	return convertLinkedListToText(listHead);
}