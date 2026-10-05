import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Link } from "react-router";
import { buildTree } from "../utils/folders";
import Icon from "./Icon";
import Menu from "./Menu";

/**
 * Collapsible nested folder list. Each row can be dragged (to move the
 * folder) and accepts drops of notes (move into it) and folders (nest it).
 */
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

  const drag = useDraggable({ id: `folder:${node.id}`, data: { type: "folder", folder: node } });
  const drop = useDroppable({
    id: `drop:${node.id}`,
    data: { type: "folder-target", folderId: node.id, accepts: ["note", "folder"] },
  });
  const draggingType = drop.active?.data.current?.type;
  const canDrop = drop.isOver && draggingType && drop.active.id !== `folder:${node.id}`;
  const { onKeyDown: _keyboard, ...pointerListeners } = drag.listeners ?? {};

  return (
    <li>
      <div
        ref={drop.setNodeRef}
        className={`folder-row ${isSelected ? "active" : ""} ${canDrop ? "drop-over" : ""} ${drag.isDragging ? "is-dragging" : ""}`}
        style={{ "--depth": depth }}
      >
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
          ref={drag.setNodeRef}
          to={`/notes?folder=${node.id}`}
          className="folder-link"
          aria-current={isSelected ? "page" : undefined}
          title={node.name}
          {...pointerListeners}
        >
          <Icon name={node.is_starred ? "star" : "folder"} className={node.is_starred ? "star-icon" : ""} />
          <span className="folder-name">{node.name}</span>
          {node.note_count > 0 && <span className="count">{node.note_count}</span>}
        </Link>
        <Menu
          className="row-menu"
          label={`Actions for folder ${node.name}`}
          trigger={<Icon name="more" />}
          items={[
            { label: "New subfolder", icon: <Icon name="folder-plus" />, onSelect: () => onAction("subfolder", node) },
            { label: node.is_starred ? "Unstar" : "Star", icon: <Icon name="star" />, onSelect: () => onAction("star", node) },
            { label: "Rename", icon: <Icon name="pen" />, onSelect: () => onAction("rename", node) },
            { label: "Move", icon: <Icon name="move" />, onSelect: () => onAction("move", node) },
            { label: "Export as .zip", icon: <Icon name="download" />, onSelect: () => onAction("export", node) },
            { label: "Move to trash", icon: <Icon name="trash" />, danger: true, onSelect: () => onAction("delete", node) },
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
