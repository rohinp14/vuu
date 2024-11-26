import { TableProps } from "@finos/vuu-table";
import { Table } from "@finos/vuu-table";
import { TreeDataSource } from "@finos/vuu-data-local";
import { useMemo, useRef } from "react";
import { TableConfig } from "@finos/vuu-table-types";
import {
  isRowSelected,
  metadataKeys,
  type RowToObjectMapper,
  type TreeSourceNode,
} from "@finos/vuu-utils";

const { DEPTH, IS_LEAF, KEY, IDX } = metadataKeys;

interface Props extends Omit<TableProps, "config" | "dataSource"> {
  config?: Pick<
    TableConfig,
    "columnSeparators" | "rowSeparators" | "zebraStripes"
  >;
  dataSource?: TreeDataSource;
  source?: TreeSourceNode[];
}

export type TreeTableProps = Props &
  ({ dataSource: TreeDataSource } | { source: TreeSourceNode[] });

const rowToTreeNodeObject: RowToObjectMapper = (row, columnMap) => {
  const { [IS_LEAF]: isLeaf, [KEY]: key, [IDX]: index, [DEPTH]: depth } = row;
  const firstColIdx = columnMap.nodeData;
  const labelColIdx = firstColIdx + depth;

  return {
    key,
    index,
    isGroupRow: !isLeaf,
    isSelected: isRowSelected(row),
    data: {
      label: row[labelColIdx],
      nodeData: row[firstColIdx],
    },
  };
};

export const TreeTable = ({
  config,
  dataSource,
  source,
  ...tableProps
}: TreeTableProps) => {
  const dataSourceRef = useRef<TreeDataSource>();
  useMemo(() => {
    if (dataSource) {
      dataSourceRef.current = dataSource;
    } else if (source) {
      dataSourceRef.current = new TreeDataSource({
        data: source,
      });
    } else {
      throw Error(`TreeTable either source or dataSource must be provided`);
    }
  }, [dataSource, source]);

  const tableConfig = useMemo<TableConfig>(() => {
    return {
      ...config,
      columns: dataSourceRef.current?.columnDescriptors ?? [],
      columnSeparators: false,
      rowSeparators: false,
    };
  }, [config]);

  if (dataSourceRef.current === undefined) {
    return null;
  }

  return (
    <Table
      {...tableProps}
      className="vuuTreeTable"
      config={tableConfig}
      dataSource={dataSourceRef.current}
      groupToggleTarget="toggle-icon"
      navigationStyle="tree"
      rowToObject={rowToTreeNodeObject}
      showColumnHeaderMenus={false}
      selectionModel="single"
      selectionBookendWidth={0}
    />
  );
};