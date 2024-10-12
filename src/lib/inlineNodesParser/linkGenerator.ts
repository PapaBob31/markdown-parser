import type {Node} from "./index"
import { PUNCTUATIONS, escapeSpecialCharacters } from "./index"
const querystring = require('node:querystring')

export interface LinkRefData {
	label: string;
	destination: string;
	title: string
}

/** Returns the index of the first '\n' character in the text parameter starting from the startIndex parameter
 * or the index of the last character if no '\n' character was found provided no non-whitespace character 
 * was found before then*/
function getEndOfLineIfValid(text: string, startIndex: number) {
	if (startIndex >= text.length-1) {
		return startIndex;	
	}
	for (let i=startIndex; i<text.length; i++) {
		if ((/\S/).test(text[i])) {
			return -1;
		}
		if (text[i] === '\n') {
			return i
		}
		if (i === text.length-1)
			return i;
	}
}


/** Parses a text starting from an optionally specified index and returns an Array of Objects
 * whose properties are the label, destination and title of a valid link reference 
 * definition (as per GFM spec). It also returns the new content of the text parameter 
 * after stripping the link reference definitions from the text parameter
 * @param {text} : The string containing the link refernce definition */
export function getLinkReferenceDefs(text: string, startIndex:number=0) : {linkRefsData: LinkRefData[], newText: string} {
	let i = startIndex;
	const linkRefDef = {label: "", destination: "", title: ""};
	const results:{linkRefsData: LinkRefData[], newText: string} = {linkRefsData: [], newText: ""};

	[linkRefDef.label, i] = getLabel(text, i);
	if (!linkRefDef.label || i == text.length-2 || text[i+1] !== ":" ||
	 !(/\S/).test(linkRefDef.label) || linkRefDef.label.length > 999) // invalid label syntax
		return results;
	[linkRefDef.destination, i] = getDestination(text, i+2); // i is incremented so we start parsing the destination immediately after the ':' character
	if (!linkRefDef.destination) {
		return results;
	}
	let endIndex = -1;
	[linkRefDef.title, endIndex] = getTitle(text, i+1); // i is incremented so we start parsing the title immediately after the last destination character
	if (linkRefDef.title === null ) { // invalid title syntax
		return results;	
	}
	if (linkRefDef.title !== null){
		let refEndIndex = getEndOfLineIfValid(text, endIndex+1);
		if (refEndIndex === -1) // non-whitespace character after title was found
			return results;
		i = refEndIndex;
	}

	// valid link reference definition
	results.linkRefsData.push(linkRefDef);
	results.newText = text.slice(i+1)

	let moreData = i !== text.length-1 && getLinkReferenceDefs(text, i);
	if (moreData.linkRefsData.length > 0) { // the text still contains more link refernece definitions
		results.linkRefsData.push(...moreData.linkRefsData)
		results.newText = moreData.newText; // the new content of the text would always be after the last link reference definition
	}
	return results
}

/** Returns an Array containing a GFM label text followed by the index where the label ends in a
 *  string (that is, the closing ']' index) if any syntatically correct label is present in the string
 * @param {text} : The string to parse
 * @param {startIndex} : The index to start parsing the string from
 * */
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

/** Returns an Array containing a link destination followed by the index of the character where the 
 * destination ends in a string provided the string conforms to the GFM link syntax.
 * @param {text} : string to parse
 * @param {startIndex} : Index of text to start parsing from 
 * @param {partOfInlineLink}: indicates if the destination being parsed is part of an inline link or link reference definition*/
export function getDestination(text: string, startIndex: number, partOfInlineLink:boolean=false): [string, number] {
	let i = startIndex;
	let contentRange = false; // boolean indicating if the character being iterated is part of the link destination itself and not just markup
	let destination = ""
	let charIsEscaped = false;
	let destHasBoundary = false;

	while(true) {	
		if (text[i] === '\\' && i < text.length-1 && PUNCTUATIONS.includes(text[i+1])) {
			charIsEscaped = true // next character will be escaped
		}else if (contentRange) { 
			destination+=text[i];
			if (charIsEscaped) {
				charIsEscaped = false;
				i++;
				continue;
			}
		}

		if (destHasBoundary) {
			if (text[i] === '>'){
				destination = destination.slice(1, destination.length-1); // strip the '<>' boundary, duhh
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

/** Returns a node that's a possible opening node for a link text marker closing node
 * @param {node} : Node that requires an opening Node*/
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

// Returns the plain text content of all the nodes between two nodes
function getEnclosedText(startNode: Node, endNode: Node) {
	let currentNode = startNode.next;
	let outputText = "";

	while (currentNode !== endNode) {
		outputText += currentNode.content;
		currentNode = currentNode.next;
	}
	return outputText;
}

function normalised(str: string) {
	return str.toLowerCase().replace(/\s+/, ' ').trim();
}

export interface LinkRefDataMap {
	[normalisedLabel:string]: LinkRefData
}

/** Returns an object whose attributes are the destination and title strings associated with a label text
 * @param {labelStr} : target label text
 * @param {linkRefs} : label text - link attributes mappings */ 
function getReferenceLinkData(labelStr: string, linkRefs: LinkRefDataMap): LinkAttributes {
	let refLinkData = linkRefs[normalised(labelStr)]
	if (!refLinkData)
		return {destination: null, title: null};
	return {destination: refLinkData.destination, title: refLinkData.title};
}


// Returns the link attributes of a shorcut, refernce or colapsed link as well as the index where the link ends
function getReferenceLinks(linkText: string, textStream: string, startIndex: number, linkRefs: LinkRefDataMap):[LinkAttributes, number] {
	let i = startIndex;
	if (i === textStream.length-1 || textStream[i+1] !== '[') {
		return [getReferenceLinkData(linkText, linkRefs), i]; // shortcut links
	}
	
	let [labelText, labelTextEndIndex] = getLabel(textStream, i+1);
	if (labelText === null) {
		return [{destination: null, title: null}, i];
	}
	let data = getReferenceLinkData(labelText, linkRefs); // reference links
	if (!data.destination) { // shortcut links or collapsed refernece links
		data = getReferenceLinkData(linkText, linkRefs)
	}
	return [data, labelTextEndIndex];
}


// Transforms openingNode and closingNode to either 'a' or 'img' html tags as appropriate
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

// Changes all "link marker start" nodes before startNode parameter to "text content" nodes
function closeAllOpenersUpstream(startNode: Node) {
	let currentNode = startNode

	while (currentNode) {
		if (currentNode.type === "link marker start") {
			currentNode.type = "text content"
		}
		currentNode = currentNode.prev;
	}
}

// Returns a string with all whitespace and all non-ascii characters escaped
function urlEncode(text: string){
	let output = "";
	for (let char of text){
		if ((/\s/).test(char) || !(/[\x00-\x7F]/).test(char)){
			output += querystring.escape(char);
		}else output += char;
	}
	return output
}

/** Generates nodes containing html link tags from a textStream and adds the nodes into
 * an already exisiting linked list. Parsing starts from a specified index in the textStream */
export function generateLinkHtmlNode(textStream: string, closer: Node, linkRefs: LinkRefDataMap, startIndex: number) : [Node, number] {
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
		linkAttributes.destination = urlEncode(linkAttributes.destination)
		linkAttributes.title = linkAttributes.title && escapeSpecialCharacters(linkAttributes.title)
		closeAllOpenersUpstream(opener.prev) // closes all unclosed markers before 'opener' node since links can't be nested
		transformToLinkHtml(opener, closer, linkAttributes)
		return [opener.content === "![" ? opener : closer, i]; // `i` is the index where the link ends in the string
	}	
}

