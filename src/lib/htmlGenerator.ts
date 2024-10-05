import type { HtmlNode } from "../index"
import parseInlineNodes, { PUNCTUATIONS, getEscapedForm } from "./inlineNodesParser"

export interface LinkRef {
	label: string;
	destination: string;
	title: string
}


function getLinkReferenceDefs(text: string) { // TODO: search and replace all escaped characters with regex
	const linkData = text.match(/^\s*\[([^]+)\]:\s*((?:<.*>)|(?:\S+))\s*((?:"|'|\()[^]+)?\s*$/);
	const linkRefDef = {label: "", destination: "", title: ""};

	if (!linkData || linkData[1].length > 999) {
		return null
	}else {
		linkRefDef.label = linkData[1];
		linkRefDef.destination = linkData[2];
	}

	if (linkData && !linkData[3]){
		return linkRefDef
	}

	if (linkData && linkData[3]){
		if (linkData[3].includes("\n\n") || (linkData[3][0] !== linkData[3][linkData[3].length-1])) {
			// first condition is maybe a crude way of checking if the text contains blank lines
			return null
		}else linkRefDef.title = linkData[3].slice(1, linkData[3].length-1);
	}

	return linkRefDef
}

export function traverseTreeToGetLinkRefs(rootNode: HtmlNode) {
	let refs: LinkRef[] = [];

	if (rootNode.children && rootNode.children.length > 0) {
		for (let i=0; i<rootNode.children.length; i++) {
			let childNode = rootNode.children[i];
			if (["blockquote", "ul", "ol", "li"].includes(childNode.nodeName)){
				refs = refs.concat(traverseTreeToGetLinkRefs(childNode));
				continue
			}
			if (childNode.nodeName !== "paragraph") {
				continue;
			}
			let linkReference = getLinkReferenceDefs(childNode.textContent as string);
			if (linkReference) {
				refs.push(linkReference);
				rootNode.children[i].textContent = ""; // since it contains link reference definitions
			}
		}
	}
	return refs;
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


/*
	'|' must delimit cells
	my implementation, my rules
	|| i.e pipes without any content in between isn't allowed, put something even if it's just whitespace
	beginning and ending whitespace would be stripped if present

*/
function getRowContents(line: string){
	let cellData = "";
	let cells = [];
	let i = 0;

	while (i < line.length) {
		if (line[i] === '|') {
			if (cellData) {
				cells.push(cellData);
				cellData = "";
			}else if (cells.length > 0) {
				cells = [];
				break;
			}	
		}else {
			cellData += line[i]
		}
		i++;

		if (i == line.length-1 && line[i] !== '|') {
			cells = [];
		}
	}
	return cells
}

function getCellAlignment(cell: string) {
	let alignment = null
	if (cell[0] === ":")
		alignment = "left";

	if (cell[cell.length-1] === ":" && alignment === "left")
		alignment = "center"
	else if (cell[cell.length-1] === ":" && alignment !== "left")
		alignment = "right";

	return alignment
}

interface TableData {
	headerCells: string[];
	bodyCells: string[][];
	cellsAlignment: string[];
}

function stripSpace(text: string) {
	if (text[0] === text[text.length-1] && text[0] === ' ') {
		return text.slice(1, text.length-1)
	}
	return text
}

// TODO: add proper indent to table's output
function generateTableHtml(tableData: TableData, indentLevel: number){
	let text = `${' '.repeat(indentLevel)}<table>\n${' '.repeat(indentLevel+2)}<thead>\n<tr>\n`

	for (let i=0; i < tableData.headerCells.length; i++) {
		const alignment = tableData.cellsAlignment[i]
		const cell = tableData.headerCells[i]
		text += `${' '.repeat(indentLevel+2)}<th${alignment ? ' align='+alignment: ""}>${stripSpace(cell)}</th>\n`
	}
	text += `${' '.repeat(indentLevel+2)}</tr>\n</thead>\n<tbody>\n`

	for (let row of tableData.bodyCells) {
		text += `${' '.repeat(indentLevel+2)}<tr>\n`
		for (let i=0; i<row.length; i++) {
			const alignment = tableData.cellsAlignment[i]
			text += `${' '.repeat(indentLevel+2)}<td${alignment ? ' align='+alignment: ""}>${stripSpace(row[i])}<td>\n`
		}
		if (row.length < tableData.headerCells.length) {
			text += (`${' '.repeat(indentLevel+2)}<td></td>\n`).repeat(tableData.headerCells.length - row.length)
		}
		text += `${' '.repeat(indentLevel+2)}</tr>\n`
	}
	text += `${' '.repeat(indentLevel+2)}</tbody>\n${' '.repeat(indentLevel)}</table>\n`
	return text
}

function constructTableFrom(text: string, indentLevel: number) {
	const tableData:TableData = {headerCells: [], bodyCells: [], cellsAlignment: []}
	let tableRows = text.split(/(?:\r\n)|\n|\r/);
	if (tableRows[0] == text)
		return "";
	for (let i=0; i<tableRows.length; i++) {
		const cells = getRowContents(tableRows[i])
		if (cells.length === 0) {
			return "";
		}
		if (tableData.headerCells.length === 0) {
			if (cells.length === 0)
				return "";
			tableData.headerCells = [...cells]
		}else if (tableData.cellsAlignment.length === 0) {
			if (cells.length === 0 || cells.length !== tableData.headerCells.length)
				return "";
			tableData.cellsAlignment = cells.map((cell) => getCellAlignment(cell))
		}else if (cells.length === 0) {
			return "";
		}else {
			tableData.bodyCells.push(cells);
		}
	}
	return generateTableHtml(tableData, indentLevel);
}

export function formsValidCharRef(text: string, index: number) { // we still need to do decimal and hexadecimal references
	let ref = ""
	let validRefs: string[] = ["amp", "copy", "lg", "gt", "lt", "apos", "quot"]; // get the rest from the html spec

	for (let i=index+1; i<text.length; i++) {
		if ((/\s/).test(text[i])){
			return false;
		}else if (text[i] === ';') {
			break;
		}else if (i === text.length-1) {
			ref = "";
			break;
		}
		ref += text[i];
	}
	if (validRefs.includes(ref)) {
		return true;
	}
	return false
}

// Removes invalid html character references
function removeInvalidCharRef(textStream: string) {
	let output = ""
	for (let i=0; i<textStream.length; i++){
		if (textStream[i] === '&' && !formsValidCharRef(textStream, i)) {
			output += "&amp;"
			continue;
		}
		output += textStream[i];
	}
	return output
}

// parse the content of leaf blocks for inline nodes and unescaped html tags
function parseContent(node: HtmlNode, linkRefs: LinkRef[], dangerousHtmlTags:string[]) {
	if (node.nodeName === "paragraph" || (/h[1-6]/).test(node.nodeName)) {
		node.textContent = parseInlineNodes(node.textContent as string, linkRefs, dangerousHtmlTags);
		if ((/h[1-6]/).test(node.nodeName))  {
			node.textContent = node.textContent.trimLeft();
		}
	}else if (["indented code block", "fenced code"].includes(node.nodeName)) {
		node.textContent = escapeSpecialCharacters(node.textContent)
	}

	if (!["indented code block", "fenced code"].includes(node.nodeName) && node.textContent) {
		node.textContent = removeInvalidCharRef(node.textContent); // maybe implement a regex solution
	}
}

// checks if a leaf block node's list grandparent is a loose list
function listAncestorIsLoose(node: HtmlNode){
	let listNodeAncestor = node.parentNode.parentNode;
	if (listNodeAncestor && listNodeAncestor.tight === "false") {
		return true;
	}
	return false;
}

function generateNodeHtml(node: HtmlNode, indentLevel: number) {
	const whiteSpace = ' '.repeat(indentLevel);

	if (node.nodeName === "html block") {
		return `${whiteSpace}${node.textContent}\n`
	}else if (node.nodeName === "paragraph") {
		let tableHtml = constructTableFrom(node.textContent, indentLevel);
		if (tableHtml) {
			return tableHtml;
		}
		if (node.parentNode.nodeName !== "li" || listAncestorIsLoose(node))
			return node.textContent ? `${whiteSpace}<p>${node.textContent}</p>\n` : "";// TODO: Don't nest inside paragraphs if content is only comment
		return node.textContent ? `${whiteSpace}${node.textContent}\n` : "";// TODO: Don't nest inside paragraphs if content is only comment
	}else if ((/h[1-6]/).test(node.nodeName)) {
		const tag = node.nodeName;
		return `${whiteSpace}<${tag}>${node.textContent}</${tag}>\n`
	}else if (node.nodeName === "fenced code" || node.nodeName === "indented code block") {
		return `${whiteSpace}<pre class="${node.infoString || ''}">\n${whiteSpace+'  '}<code>${node.textContent}\n${whiteSpace+'  '}</code>\n${whiteSpace}</pre>\n`
	}
}


export default function generateHtmlFromTree(rootNode: HtmlNode, indentLevel: number, linkRefs: LinkRef[], dangerousHtmlTags:string[]):string {
	let text = "";
	const whiteSpace = ' '.repeat(indentLevel);
	if (rootNode.nodeName === "hr") {
		return `${whiteSpace}<${rootNode.nodeName}/>\n`
	}else if (rootNode.nodeName === "ol") {
		text = `${whiteSpace}<${rootNode.nodeName} start="${rootNode.startNo}">\n`	
	}else if (rootNode.textContent === undefined) {
		text = `${whiteSpace}<${rootNode.nodeName}>\n`;
	}

	if (rootNode.textContent === undefined) {
		if (rootNode.nodeName === "root")
			text = "";
		else 
			indentLevel += 2;

		for (let childNode of rootNode.children) {
			text += `${generateHtmlFromTree(childNode, indentLevel, linkRefs, dangerousHtmlTags)}`;
		}
	}else {
		parseContent(rootNode, linkRefs, dangerousHtmlTags)
		text = generateNodeHtml(rootNode, indentLevel);
	}

	if (rootNode.textContent === undefined && rootNode.nodeName !== "root") {
		text += `${whiteSpace}</${rootNode.nodeName}>\n`;
	}
	
	return text;
}

