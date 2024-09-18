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

export function getHtmlTagEndPos(startIndex: number, str: string, forbiddenTagNames: string[]) {
	const htmlComponents: string[] = []
	let currentComponent = "";
	let currentComponentType = "tag"
	let tagEndPos = -1;
	let tagName = "";
	const closingTagPattern = str.slice(startIndex).match(/^<\/\w+\s*>/);

	if (closingTagPattern) {
		tagName = closingTagPattern[0].slice(1).toLowerCase();
		// 1st condition: An ASCII alphabet must start an html tag as per gfm spec
		if (!(/[a-zA-Z]/).test(str[startIndex+2]) || forbiddenTagNames.includes(tagName)) {
			return -1;
		}
		return startIndex + closingTagPattern[0].length - 1;
	}

	
	for (let i=startIndex; i<str.length; i++) {
		if (currentComponent && ['"', "'"].includes(currentComponent[0])) {
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
		}else if (currentComponent && ['"', "'"].includes(currentComponent[0])) {
			htmlComponents.push(currentComponent); // execution can't reach here unless quoted value has already been closed
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
		currentNode = currentNode.next; 
	}else {
		currentNode.content += newContent;
	}
	if (nodeType.startsWith("link marker")) {
		currentNode.closed = false;
	}
	return currentNode;
}

function getAutoLinkStr(startIndex: number, text: string) {
	let matchedPattern = text.slice(startIndex).match(/<([a-zA-Z][\w+.-]{1,32}:\S*)>/)
	if (!matchedPattern) {
		return "";
	}
	return matchedPattern[1];
}

function processAngleBracketMarker(text: string, bracketPos: number, currentNode: Node, forbiddenTagNames: string[]) {
	let htmlTagEndPos = getHtmlTagEndPos(bracketPos, text, forbiddenTagNames);
	if (htmlTagEndPos > -1) {
		currentNode = addOrUpdateExistingNode("raw html", text.slice(bracketPos, htmlTagEndPos + 1), currentNode)
		return [currentNode, htmlTagEndPos]
	}
	let url = getAutoLinkStr(bracketPos, text);
	if (url) {
		let rawHtml = `<a href="${url}">${url}</a>`;
		currentNode = addOrUpdateExistingNode("raw html", rawHtml, currentNode)
		return [currentNode, bracketPos+url.length+1] // zero based addition ( + the 2 angle brackets acting as boundary for the autolink)
	}
	let matchedPattern = text.slice(bracketPos).match(/<!--(?!(?:>|->))[^]*-->/)
	if (matchedPattern) {
		currentNode = addOrUpdateExistingNode("raw html", matchedPattern[0], currentNode);
		return [currentNode, matchedPattern[0].length-1]
	}
	return [];
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
		default:
			return char
	}
}

// TODO: maybe implement hard line break
function generateLinkedList(text: string, dangerousHtmlTags: string[]) {
	const head:Node = {type: "", closed: false, content: "", next: null, prev: null}
	let currNode = head;
	let charIsEscaped = false;
	let i=0;
	let adjSpaceCharCount = 0; // adjacent space character count

	while (i < text.length){
		if (text[i] === '\n' && (charIsEscaped || adjSpaceCharCount >= 2) && i !== text.length-1) {
			if (!charIsEscaped && adjSpaceCharCount >= 2){
				let contentEnd = currNode.content.length - adjSpaceCharCount;
				currNode.content = currNode.content.slice(0, contentEnd)
			}
			currNode = addOrUpdateExistingNode("raw html", "<br/>", currNode);
		}else if (charIsEscaped && PUNCTUATIONS.includes(text[i])) {
			let replacement = getEscapedForm(text[i]);
			currNode = addOrUpdateExistingNode("text content", replacement, currNode);
			charIsEscaped = false;
		}else if (text[i] === '\\'){
			charIsEscaped = true;
		}else if (text[i] === '<') {
			const processedChanges = processAngleBracketMarker(text, i, currNode, dangerousHtmlTags)
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
		if (text[i] === ' ')
			adjSpaceCharCount++
		else adjSpaceCharCount = 0;
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

export default function parseInlineNodes(text: string, linkRefs: LinkRef[], dangerousHtmlTags: string[]): string {
	let listHead = generateLinkedList(text, dangerousHtmlTags);
	generateLinkNodes(listHead, linkRefs);
	generateEmNodes(listHead);
	return convertLinkedListToText(listHead);
}