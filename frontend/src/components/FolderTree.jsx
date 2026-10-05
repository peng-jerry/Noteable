import { Link } from "react-router";
import { buildTree } from "../utils/folders";
import Icon from "./Icon";
import Menu from "./Menu";

/** Collapsible nested folder list (nested lists of links). */
export default function FolderTree({ folders, selectedId, expanded, onToggle, onAction }) {
  const tree = buildTree(folders);
  return (
    <ul className="folder-tree">
      {tree.map((node) => (
        <FolderNode
          key={node.id}
          node={node}
          depth={0}
          selectedId={selectedId}
          expanded={expanded}
          onToggle={onToggle}
          onAction={onAction}
        />
      ))}
    </ul>
  );
}

function FolderNode({ node, depth, selectedId, expanded, onToggle, onAction }) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const isSelected = node.id === selectedId;

  return (
    <li>
      <div className={`folder-row ${isSelected ? "active" : ""}`} style={{ "--depth": depth }}>
        {hasChildren ? (
          <button
            type="button"
            className="folder-toggle"
            onClick={() => onToggle(node.id)}
            aria-expanded={isOpen}
            aria-label={`${isOpen ? "Collapse" : "Expand"} ${node.name}`}
          >
            <Icon name={isOpen ? "chevron-down" : "chevron-right"} />
          </button>
        ) : (
          <span className="folder-toggle-spacer" />
        )}
        <Link
          to={`/notes?folder=${node.id}`}
          className="folder-link"
          aria-current={isSelected ? "page" : undefined}
          title={node.name}
        >
          <Icon name="folder" />
          <span className="folder-name">{node.name}</span>
          {node.note_count > 0 && <span className="count">{node.note_count}</span>}
        </Link>
        <Menu
          className="folder-menu"
          label={`Actions for folder ${node.name}`}
          trigger={<Icon name="more" />}
          items={[
            { label: "New subfolder", icon: <Icon name="folder-plus" />, onSelect: () => onAction("subfolder", node) },
            { label: "Rename", icon: <Icon name="pen" />, onSelect: () => onAction("rename", node) },
            { label: "Move", icon: <Icon name="move" />, onSelect: () => onAction("move", node) },
            { label: "Delete", icon: <Icon name="trash" />, danger: true, onSelect: () => onAction("delete", node) },
          ]}
        />
      </div>
      {hasChildren && isOpen && (
        <ul>
          {node.children.map((child) => (
            <FolderNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expanded={expanded}
              onToggle={onToggle}
              onAction={onAction}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
