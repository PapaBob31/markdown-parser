import type {Node} from "./index"
import { PUNCTUATIONS } from "./index"
import { escapeSpecialCharacters } from "../htmlGenerator"
export interface LinkRef {
	label: string;
	destination: string;
	title: string
}


/** Returns An object containing the label, destination and title of a
 *  link reference definition (as per GFM spec) as attributes
 * @param {text} : The string containing the link refernce definition */
export function getLinkReferenceDefs(text: string) { 
	const linkData = text.match(/^\s*\[([^]+)\]:\s*((?:<.*?>)|(?:\S+))\s*((?:"|'|\()[^]+)?\s*$/); // link reference definition as per gfm spec
	const linkRefDef = {label: "", destination: "", title: ""};
	let i=0;
	[linkRefDef.label, i] = getLabel(text)
	if (!linkRefDef.label || i == text.length-2 || text[i+1] !== ":" || !(/\S/).test(linkRefDef.label) || linkRefDef.label.length > 999)
		return null;
	i+=2; // Destination parsing should start immediately after the ':' character
	[linkRefDef.destination, i] = getDestination(text, i);
	if (!linkRefDef.destination)
		return null
	if (i === text.length)
		return linkRefDef;

	[linkRefDef.title, i] = getTitle(text, i+1);
	if (linkRefDef.title === null)
		return null

	if (i < text.length-1 && (/\S/).test(text.slice(i+1))) // only whitespace characters are allowed after link titles if present
		return null
	return linkRefDef
}

// Returns the label and the index where the label ends in a string
// extracted from a string with correct markdown label syntax
export function getLabel(text: string, startIndex=0): [string, number] {
	let linkLabel = ""
	let contentRange = false; // boolean indicating if the character being iterated is part of the label text itself and not just markup
	let charIsEscaped = false;
	let i = startIndex;

	while (true) {
		if (charIsEscaped) {
			linkLabel += text[i];
			charIsEscaped = false;
		}else if (text[i] === '\\' && !contentRange) { // invalid escape character
			return [null, -1]
		}else if (text[i] === '\\' && i < text.length-1 && PUNCTUATIONS.includes(text[i+1])) {
			charIsEscaped = true
		}else if (!contentRange && text[i] === '[') {
			contentRange = true;
		}else if (!contentRange && (/\S/).test(text[i])){
			return [null, -1]
		}else if (text[i] === ']') {
			break;
		}else if (text[i] === '[') { // link label contains unescaped '['
			return [null, -1]
		}else if (contentRange) {
			linkLabel += text[i]
		}
		if (i === text.length-1){
			return [null, -1]; // No link label was parsed yet
		}
		i++;
	}

	return [linkLabel, i]
}


function hasBalancedBrackets(text: string) {
	let unBalancedBrackets = 0

	for (let char of text) {
		if (char === '(') {
			unBalancedBrackets++;
		}else if (char === ')' && unBalancedBrackets === 0) { // no opening bracket
			return false
		}else if (char === ')') {
			unBalancedBrackets--
		}
	}

	if (unBalancedBrackets === 0)
		return true;
	return false;
}

/** Returns a link destination and the index of the character where the 
 * destination ends in a string provided the string conforms to the markdown link syntax.
 * @param {text} : string to parse
 * @param {startIndex} : Index of text to start parsing from */
export function getDestination(text: string, startIndex: number, partOfInlineLink:boolean=false): [string, number] {
	let i = startIndex;
	let contentRange = false; // boolean indicating if the character being iterated is part of the link destination itself and not just markup
	let destination = ""
	let charIsEscaped = false;
	let destHasBoundary = false;

	while(true) {	
		if (charIsEscaped) {
			charIsEscaped = false;
			destination+=text[i];
			i++;
			continue;
		}else if (text[i] === '\\' && i < text.length-1 && PUNCTUATIONS.includes(text[i+1])) {
			charIsEscaped = true
			i++;
			continue;
		}else if (contentRange) { // </ tb 
			destination+=text[i];
		}

		if (destHasBoundary) {
			if (text[i] === '>'){
				destination = destination.slice(1, destination.length-1); // strip the boundary, duhh
				break;
			}else if (text[i] === '<'){ // unescaped
				return [null, -1];
			}
		}else if (text[i+1] === ')' && partOfInlineLink && hasBalancedBrackets(destination)){
			break;
		}else if (contentRange && (/\s/).test(text[i+1])) {
			break;
		}


		if ((/\S/).test(text[i]) && !contentRange) {
			contentRange = true
			if (text[i] === '<' && !charIsEscaped)
				destHasBoundary = true;
			destination += text[i];
		}

		if (i === text.length-1){
			return [null, -1];
		}

		i++;
	}
	if (hasBalancedBrackets(destination)){
		return [destination, i];
	}
	return [null, -1];
}


/** Returns a link title and the index where the title ends in a string
 * provided the string conforms to the markdown link syntax.
 * @param {text} : string to parse
 * @param {startIndex} : Index of text to start parsing from */
export function getTitle(text: string, startIndex: number): [string, number] {
	let i = startIndex;
	let contentRange = false; // boolean indicating if the character being iterated is part of the link title itself and not just markup
	let charIsEscaped = false;
	const properDelimiters = "'\"("
	let startDelimiter = '';
	let title = "";

	while (true) {
		if (charIsEscaped) {
			title += text[i];
			charIsEscaped = false;
		}else if (text[i] === '\\' && i < text.length-1 && PUNCTUATIONS.includes(text[i+1])) {
			charIsEscaped = true
		}else if (!contentRange && (/\S/).test(text[i])){
			if (!properDelimiters.includes(text[i])) {
				return [null, -1]
			}else {
				contentRange = true;
				startDelimiter = text[i];
			}
		}else if (contentRange){
			if (startDelimiter === text[i] || (startDelimiter === "(" && text[i] === ")")) {
				break; 
			}
			if (startDelimiter === '(' || text[i] === '('){ // unescaped
				return [null, -1]
			}
			title += text[i];
		}

		i++;	
	}
	return [title, i];

}


function getOpener(node: Node) {
	let currentNode = node.prev;
	
	while (currentNode !== null) {
		if (currentNode && currentNode.type === "link marker start") {
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

function getEnclosedText(startNode: Node, endNode: Node) { // escape special characters
	let currentNode = startNode.next;
	let outputText = "";

	while (currentNode !== endNode) {
		outputText += currentNode.content;
		currentNode = currentNode.next;
	}
	return outputText;
}

function normalized(str: string) {
	return str.toLowerCase().replace(/\s+/, ' ').trim();
}

function getReferenceLinkData(labelStr: string, linkRefs: LinkRef[]): LinkAttributes {
	for (let obj of linkRefs) {
		if (normalized(obj.label) === normalized(labelStr)) {
			return {destination: obj.destination, title: obj.title};
		}
	}
	return {destination: null, title: null};
}

function getReferenceLinks(linkText: string, textStream: string, startIndex: number, linkRefs: LinkRef[]):[LinkAttributes, number] {
	let i = startIndex;
	if (i === textStream.length-1 || textStream[i+1] !== '[') {
		return [getReferenceLinkData(linkText, linkRefs), i];
	}
	
	let [labelText, labelTextEndIndex] = getLabel(textStream, i+1);
	if (labelText === null) {
		return [{destination: null, title: null}, i];
	}
	let data = getReferenceLinkData(labelText, linkRefs);
	if (!data.destination) {
		data = getReferenceLinkData(linkText, linkRefs)
	}
	return [data, labelTextEndIndex];
}

function transformToLinkHtml(openingNode: Node, closingNode: Node, attributes: any): Node {
	let linkAttributes:LinkAttributes;
	let linkText = getEnclosedText(openingNode, closingNode)
	let linkType = openingNode.content === "![" ? "img" : "link";
	if (linkType === "link" && !linkText) {
		return null;
	}

	if (linkType === "link") {
		openingNode.content = `<a href="${attributes.destination}"${attributes.title ? ' title="'+attributes.title+'"' : ""}>`;
		closingNode.content = `</a>`
	}else {
		openingNode.content = `<img src="${attributes.destination}" alt="${linkText}"${attributes.title ? ' title="'+attributes.title+'"' : ""}>`;
		openingNode.next = null;
	}
	openingNode.type = "raw html"
	closingNode.type = "raw html"
}

function closeAllOpenersUpstream(startNode: Node) {
	let currentNode = startNode

	while (currentNode) {
		if (currentNode.type === "link marker start") {
			currentNode.type = "text content"
		}
		currentNode = currentNode.prev;
	}
}


export function generateLinkHtmlNode(textStream: string, closer: Node, linkRefs: LinkRef[], startIndex: number) : [Node, number] {
	let linkAttributes = {destination: "", title: ""}
	const opener = getOpener(closer)
	if (!opener)
		return [null, -1];

	let linkText = getEnclosedText(opener, closer);
	let i = startIndex;
	if (i < textStream.length-2 && textStream[i+1] === "(") {
		i+=2; // Destination parsing should start immediately after the '(' character
		[linkAttributes.destination, i] = getDestination(textStream, i, true);
		if (linkAttributes.destination && i !== textStream.length-1) {
			let titleEnd:number;
			[linkAttributes.title, titleEnd] = getTitle(textStream, i+1);
			if (linkAttributes.title) {
				i = titleEnd;
			}
		}
	}

	if (linkAttributes.destination) {
		textStream === `They ought to be on the same line [link text](google.com "google's website")(blah)` && console.log("THIS!: ", linkAttributes);
		let end = i < textStream.length-1 && textStream.slice(i+1).match(/^\s*\)/);
		if (!end){
			return [null, -1];
		}
		i += end[0].length;
	}else {
		[linkAttributes, i] = getReferenceLinks(linkText, textStream, i, linkRefs);
	}
	if (!linkAttributes.destination) {
		opener.type = "text content"
		closer.type = "text content"
		return [null, -1];
	}else {
		linkAttributes.destination = escapeSpecialCharacters(linkAttributes.destination)
		linkAttributes.title = linkAttributes.title && escapeSpecialCharacters(linkAttributes.title)
		closeAllOpenersUpstream(opener.prev)
		transformToLinkHtml(opener, closer, linkAttributes)
		return [opener.content === "![" ? opener : closer, i];
	}	
}
