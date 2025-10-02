import type { HtmlNode } from "../index"
import parseInlineNodes, { PUNCTUATIONS, escapeSpecialCharacters, getEscapedForm, parseCharRef } from "./inlineNodesParser"
import { extractLinkRefsData } from "./inlineNodesParser/linkGenerator"
import type {LinkRefData, LinkRefDataMap} from "./inlineNodesParser/linkGenerator"

export function updateLinkRefsMap(rootNode: HtmlNode, linkRefsMap: LinkRefDataMap) {
	const containerNodes = ["root", "li", "blockquote", "ol", "ul"];
	if (containerNodes.includes(rootNode.nodeName)){
		const lastChildNode = rootNode.children[rootNode.children.length-1];
		for (let child of rootNode.children) {
			if (child.nodeName === "paragraph") {
				const newText = extractLinkRefsData(child.textContent, linkRefsMap)
				if (newText){
					child.textContent = newText
				}else {
					child.nodeName = "deleted"
				}
			}else if (containerNodes.includes(child.nodeName)){
				updateLinkRefsMap(child, linkRefsMap)
			}
		}
		rootNode.children = rootNode.children.filter(child => child.nodeName != "deleted")
	}
}



// parse the content of leaf blocks for inline nodes and unescaped html tags
function parseContent(node: HtmlNode, indentLevel:number, linkRefs: LinkRefDataMap, dangerousHtmlTags:string[]) {
	if (node.nodeName === "paragraph" || (/h[1-6]/).test(node.nodeName)) {
		// console.log(1, node.textContent)
		node.textContent = parseInlineNodes(node.textContent as string, linkRefs, dangerousHtmlTags);
		// console.log(node.textContent)
	}else if (["indented code block", "fenced code backtick", "fenced code tilde"].includes(node.nodeName)) {
		node.textContent = escapeSpecialCharacters(node.textContent)
	}
}

// Returns a boolean indicating if a node's grandparent is a loose list
// node parameter expected is a leaf block type
function listAncestorIsLoose(node: HtmlNode){
	let listNodeAncestor = node.parentNode.parentNode;
	if (listNodeAncestor && listNodeAncestor.tight === "false") {
		return true;
	}
	return false;
}

function getFirstWord(str: string) {
	let wordStart = false
	let word = ""
	let charIsEscaped = false
	for (let char of str) {
		if (!charIsEscaped && char === "\\"){
			charIsEscaped = true
			continue;
		}

		if (!wordStart && (/[^\\<>;,.()[\]{}!`~+\-_!=*&^%$#@"':?~|\s]/).test(char)) {
			wordStart = true
		}else if (wordStart && (/[\\<>;,.()[\]{}!`~+\-_!=*&^%$#@"':?~|\s]/).test(char) && !charIsEscaped) {
			break;
		}
		if (wordStart)
			word += char;

		if (charIsEscaped)
			charIsEscaped = false
	}
	return word;
}

// Generates the html representation of a node
function generateNodeHtml(node: HtmlNode, indentLevel: number) {
	if (node.nodeName.startsWith("html block")) { // "html block type 7"
		return `${node.textContent.trimEnd()}\n`
	}else if (node.nodeName === "paragraph") {
		if (node.infoString === "loose") {
			return node.textContent ? `<p>${node.textContent.trim()}</p>\n` : "";
		}else {
			return node.textContent.trim();
		}
	}else if (node.nodeName === "table") {
		return node.textContent;
	}else if ((/h[1-6]/).test(node.nodeName)) {
		const tag = node.nodeName;
		return `<${tag}>${node.textContent}</${tag}>\n` // html header
	}else if (node.nodeName.startsWith("fenced code") || node.nodeName === "indented code block") {
		if (node.nodeName === "indented code block") {
			let contentEndIndex = -1
			for (let i=node.textContent.length-1; i>=0; i--) {
				if (node.textContent[i] === '\n')
					contentEndIndex = i
				else if (!(/\s/).test(node.textContent[i])) {
					break;
				}
			}

			if (contentEndIndex > -1){
				node.textContent = node.textContent.slice(0, contentEndIndex)
			}
		}
		if (node.textContent && node.textContent[node.textContent.length-1] !== '\n')
			node.textContent+='\n'
		
		return `<pre><code${node.infoString ? (" class=\"language-"+parseCharRef(node.infoString)+'"') : ''}>${node.textContent}</code></pre>\n`
	}
}

// Generates the formatted html representation of a node
function generateNodeHtmlPretty(node: HtmlNode, indentLevel: number) {
	const whiteSpace = ' '.repeat(indentLevel); // indentation for node's generated html

	if (node.nodeName === "html block") {
		return `${whiteSpace}${node.textContent}\n`
	}else if (node.nodeName === "paragraph") {
		if (node.parentNode.nodeName !== "li" || listAncestorIsLoose(node))
			return node.textContent ? `${whiteSpace}<p>${node.textContent}</p>\n` : "";
		return node.textContent ? `${whiteSpace}${node.textContent}\n` : ""; // Paragraph nodes inside tight lists should be rendered without tags
	}else if (node.nodeName === "table") {
		return node.textContent;
	}else if ((/h[1-6]/).test(node.nodeName)) {
		const tag = node.nodeName;
		return `${whiteSpace}<${tag}>${node.textContent}</${tag}>\n` // html header
	}else if (node.nodeName.startsWith("fenced code") || node.nodeName === "indented code block") {
		return (
			`${whiteSpace}<pre>\n${whiteSpace+'  '}`+
			`<code${node.infoString ? (" class="+node.infoString+'"') : ''}">${node.textContent}\n${whiteSpace+'  '}</code>\n${whiteSpace}</pre>\n`
		)
	}
}


/** Generates html text from a tree containing markdown blocks as nodes
 * @param {rootNode} : The root node of the tree 
 * @param {indentLevel} : The number of spaces to be used for indentation when generating content
 * @param {linkRefs} : key-value mappings of link label and link label reference definitions 
 * @param {dangerousHtmlTags} : array of strings containing tag names that would be considered dangerous html */
export function generateHtmlFromTreePretty(rootNode: HtmlNode, indentLevel: number, linkRefs: LinkRefDataMap, dangerousHtmlTags:string[]):string {
	let text = "";
	const whiteSpace = ' '.repeat(indentLevel); // indentation for node's generated html

	// Generate the opening tag for the node
	if (rootNode.nodeName === "hr") {
		return `${whiteSpace}<${rootNode.nodeName}/>\n`
	}else if (rootNode.nodeName === "ol") {
		text = `${whiteSpace}<${rootNode.nodeName} start="${rootNode.startNo}">\n`	
	}else if (rootNode.textContent === undefined) {
		text = `${whiteSpace}<${rootNode.nodeName}>\n`;
	}

	if (rootNode.textContent === undefined) { // rootNode is a container block
		if (rootNode.nodeName === "root") // the root node of the tree
			text = ""; // Html shouldn't be generated for the tree's root node because it represents the document being parsed
		else 
			indentLevel += 2; // A node's children should be indented 2 spaces more than the parent

		for (let childNode of rootNode.children) {
			text += `${generateHtmlFromTree(childNode, indentLevel, linkRefs, dangerousHtmlTags)}`;
		}
	}else { // rootNode is a leaf block
		parseContent(rootNode, indentLevel, linkRefs, dangerousHtmlTags)
		text = generateNodeHtml(rootNode, indentLevel);
		console.log(text)
	}

	if (rootNode.textContent === undefined && rootNode.nodeName !== "root") {
		text += `${whiteSpace}</${rootNode.nodeName}>\n`; // Generate the closing tag for the node
	}
	
	return text;
}

function removeLeadingZeros(numText: string){
	let firstNonZeroCharIndex = -1
	for (let i=0; i<numText.length; i++){
		if (i === numText.length-1 || numText[i] !== '0'){
			firstNonZeroCharIndex = i
			break;
		}
	}
	return numText.slice(firstNonZeroCharIndex)		
}


/** Generates html text from a tree containing markdown blocks as nodes
 * @param {rootNode} : The root node of the tree 
 * @param {indentLevel} : The number of spaces to be used for indentation when generating content
 * @param {linkRefs} : key-value mappings of link label and link label reference definitions 
 * @param {dangerousHtmlTags} : array of strings containing tag names that would be considered dangerous html */
export default function generateHtmlFromTree(rootNode: HtmlNode, indentLevel: number, linkRefs: LinkRefDataMap, dangerousHtmlTags:string[]):string {
	let text = "";

	// Generate the opening tag for the node
	if (rootNode.nodeName === "hr") {
		return `<${rootNode.nodeName} />\n`
	}else if (rootNode.nodeName === "ol") {
		text = `<${rootNode.nodeName}${rootNode.startNo != '1' ? ' start="'+removeLeadingZeros(rootNode.startNo)+'"' : ""}>\n`	
	}else if (rootNode.textContent === undefined) {
		text = `<${rootNode.nodeName}>\n`;
	}

	if (rootNode.textContent === undefined && rootNode.children.length === 0 && rootNode.nodeName !== "blockquote")
		text = text.slice(0, text.length-1)

	if (rootNode.textContent === undefined) { // rootNode is a container block
		if (rootNode.nodeName === "root") // the root node of the tree
			text = ""; // Html shouldn't be generated for the tree's root node because it represents the document being parsed
		else 
			indentLevel += 2; // A node's children should be indented 2 spaces more than the parent

		for (let i=0; i<rootNode.children.length; i++) {
			const childNode = rootNode.children[i];

			if (childNode.nodeName === "paragraph") {
				if (childNode.parentNode.nodeName !== "li" || listAncestorIsLoose(childNode)) {
					childNode.infoString = "loose"
				}else if (i === 0) { // first child node of a tight list
					text = text.slice(0, text.length-1) // remove new line that must have been appended to the parent list item opening tag
				}
			}else if (childNode.nodeName === "blank") {
				continue;
			}
			text += generateHtmlFromTree(childNode, indentLevel, linkRefs, dangerousHtmlTags);
			if (rootNode.children.length > 1 && (childNode.nodeName === "paragraph") && childNode.infoString != "loose") {
				if (i !== rootNode.children.length-1)
					text += '\n'
			}
		}

	}else { // rootNode is a leaf block
		parseContent(rootNode, indentLevel, linkRefs, dangerousHtmlTags)
		text = generateNodeHtml(rootNode, indentLevel);
	}

	if (rootNode.textContent === undefined && rootNode.nodeName !== "root") {
		text += `</${rootNode.nodeName}>\n`; // Generate the closing tag for the node
	}
	
	return text;
}

