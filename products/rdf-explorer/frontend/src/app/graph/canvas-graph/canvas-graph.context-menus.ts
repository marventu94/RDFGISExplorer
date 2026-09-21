import cytoscape from 'cytoscape';

export type CyContextMenuConfig = {
  menuItems: {
    id: string;
    content: string;
    tooltipText?: string;
    selector: string;
    onClickFunction: (event: cytoscape.EventObject) => void;
    hasTrailingDivider?: boolean;
    disabled?: boolean;
    show?: boolean;
  }[];
};

export interface ContextMenuCallbacks {
  onCreateNode: () => void;
  onDescribe: (resource: unknown) => void;
  onEdit: (resource: unknown) => void;
  onCopyUri: (resource: unknown) => void;
  onRemove: (resource: unknown) => void;
  onNewPropertyFromNode: (resource: unknown) => void;
  onNewLiteral: (resource: unknown) => void;
}

export function buildContextMenuConfig(
  callbacks: ContextMenuCallbacks
): { menuItems: CyContextMenuConfig['menuItems'] } {
  return {
    menuItems: [
      {
        id: 'new-var',
        content: 'New variable',
        selector: 'core',
        onClickFunction: () => {
          callbacks.onCreateNode();
        },
      },
      {
        id: 'describe-node',
        content: 'Describe',
        selector: 'node[kind = "node"]',
        onClickFunction: (evt) => {
          const resource = evt.target.data('domain');
          callbacks.onDescribe(resource);
        },
        disabled: false,
        show: true,
      },
      {
        id: 'edit-node',
        content: 'Edit',
        selector: 'node[kind = "node"]',
        onClickFunction: (evt) => {
          const resource = evt.target.data('domain');
          callbacks.onEdit(resource);
        },
      },
      {
        id: 'new-prop-from-node',
        content: 'New property',
        selector: 'node[kind = "node"]',
        onClickFunction: (evt) => {
          const resource = evt.target.data('domain');
          callbacks.onNewPropertyFromNode(resource);
        },
      },
      {
        id: 'new-literal',
        content: 'New literal',
        selector: 'node[kind = "node"]',
        onClickFunction: (evt) => {
          const resource = evt.target.data('domain');
          callbacks.onNewLiteral(resource);
        },
      },
      {
        id: 'copy-uri-node',
        content: 'Copy URI',
        selector: 'node[kind = "node"]',
        onClickFunction: (evt) => {
          const resource = evt.target.data('domain');
          callbacks.onCopyUri(resource);
        },
      },
      {
        id: 'remove-node',
        content: 'Remove',
        selector: 'node[kind = "node"]',
        onClickFunction: (evt) => {
          const resource = evt.target.data('domain');
          callbacks.onRemove(resource);
        },
      },
      {
        id: 'describe-property',
        content: 'Describe',
        selector: 'node[kind = "property"]',
        onClickFunction: (evt) => {
          const resource = evt.target.data('domain');
          callbacks.onDescribe(resource);
        },
      },
      {
        id: 'edit-property',
        content: 'Edit',
        selector: 'node[kind = "property"]',
        onClickFunction: (evt) => {
          const resource = evt.target.data('domain');
          callbacks.onEdit(resource);
        },
      },
      {
        id: 'copy-uri-property',
        content: 'Copy URI',
        selector: 'node[kind = "property"]',
        onClickFunction: (evt) => {
          const resource = evt.target.data('domain');
          callbacks.onCopyUri(resource);
        },
      },
      {
        id: 'remove-property',
        content: 'Remove',
        selector: 'node[kind = "property"]',
        onClickFunction: (evt) => {
          const resource = evt.target.data('domain');
          callbacks.onRemove(resource);
        },
      },
      {
        id: 'edit-literal',
        content: 'Edit',
        selector: 'node[kind = "literal"]',
        onClickFunction: (evt) => {
          const resource = evt.target.data('domain');
          callbacks.onEdit(resource);
        },
      },
      {
        id: 'remove-literal',
        content: 'Remove',
        selector: 'node[kind = "literal"]',
        onClickFunction: (evt) => {
          const resource = evt.target.data('domain');
          callbacks.onRemove(resource);
        },
      },
    ],
  };
}
