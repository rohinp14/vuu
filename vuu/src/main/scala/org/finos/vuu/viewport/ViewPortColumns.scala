package org.finos.vuu.viewport

import org.finos.vuu.core.table.{CalculatedColumn, Column, RowData, RowWithData, ViewPortColumnCreator}

class ViewPortColumns(sourceColumns: List[Column]) {

  @volatile private var columns: List[Column] = sourceColumns

  private def canEqual(a: Any): Boolean = a.isInstanceOf[ViewPortColumns]

  override def equals(that: Any): Boolean =
    that match {
      case that: ViewPortColumns =>
        that.canEqual(this) &&
          this.columns.size == that.columns.size &&
          0 == this.columns.sortBy(c => c.name)
            .zip(that.columns.sortBy(c => c.name))
            .count(columnPair => columnPair._1.name != columnPair._2.name || columnPair._1.dataType != columnPair._2.dataType)
      case _ => false
    }

  override def hashCode(): Int = columns.sortBy(c => c.name).map(_.hashCode()).hashCode()

  def addColumn(column: Column): Unit = {
    columns = columns ++ List(column)
  }

  def columnExists(name: String): Boolean = {
    columns.exists(_.name == name)
  }

  def getColumns(): List[Column] = columns

  def getColumnForName(name: String): Option[Column] = {
    val evaluatedName = getEvaluatedName(name)
    columns.find(_.name == evaluatedName)
  }

  private def getEvaluatedName(name: String): String = {
    if (ViewPortColumnCreator.isCalculatedColumn(name)) {
      val (calcName, _, _) = ViewPortColumnCreator.parseCalcColumn(name)
      calcName
    } else {
      name
    }
  }

  def count(): Int = columns.size

  private lazy val hasCalculatedColumn = columns.exists(c => c.isInstanceOf[CalculatedColumn])

  def pullRow(key: String, row: RowData): RowData = {

    if (!hasCalculatedColumn) {
      row
    } else {
      this.pullRowAlwaysFilter(key, row)
    }
  }

  def pullRowAlwaysFilter(key: String, row: RowData): RowData = {
    val rowData = this.getColumns().map(c => c.name -> row.get(c)).toMap
    RowWithData(key, rowData)
  }
}
