package io.venuu.vuu.core.module

import io.venuu.toolbox.lifecycle.LifecycleContainer
import io.venuu.toolbox.time.Clock
import io.venuu.vuu.api.{JoinTableDef, TableDef}
import io.venuu.vuu.core.VuuServer
import io.venuu.vuu.core.table.DataTable
import io.venuu.vuu.net.rpc.RpcHandler
import io.venuu.vuu.provider.Provider

import java.nio.file.Path


case class TableDefs protected(realizedTableDefs: List[TableDef], tableDefs: List[(TableDef, (DataTable, VuuServer) => Provider)], joinDefs: List[TableDefs => JoinTableDef]){

  def add(tableDef: TableDef, func: (DataTable, VuuServer) => Provider) : TableDefs = {
      TableDefs(realizedTableDefs, tableDefs ++ List((tableDef, func)), joinDefs)
  }

  def addRealized(tableDef: TableDef) : TableDefs = {
    TableDefs(realizedTableDefs ++ List(tableDef), tableDefs, joinDefs)
  }

  def addJoin(func: TableDefs => JoinTableDef) : TableDefs = {
    TableDefs(realizedTableDefs, tableDefs, joinDefs ++ List(func))
  }

  protected def getJoinDefFuncs() = joinDefs
  protected def getTableDefsAndProviders() = tableDefs
  protected def getRealizedTableDefs() = realizedTableDefs

  def get(name: String): TableDef = {
     realizedTableDefs.find( _.name == name).get
  }
}

case class  ModuleFactoryNode protected (tableDefs: TableDefs, rpc: List[VuuServer => RpcHandler], vsName: String, staticServedResources: List[StaticServedResource]){

  def addTable(tableDef: TableDef, func: (DataTable, VuuServer) => Provider): ModuleFactoryNode ={
    ModuleFactoryNode(tableDefs.add(tableDef, func), rpc, vsName, staticServedResources)
  }

  def addJoinTable(func: TableDefs => JoinTableDef): ModuleFactoryNode ={
    ModuleFactoryNode(tableDefs.addJoin(func), rpc, vsName, staticServedResources)
  }

  def addRpcHandler(rpcFunc: VuuServer => RpcHandler): ModuleFactoryNode ={
    ModuleFactoryNode(tableDefs, rpc ++ List(rpcFunc), vsName, staticServedResources)
  }

  /**
   * Add a statically served path to the view server.
   *
   * @param uriDirectory example /foo/bar/ (which will end up being served as https://your-server/<MODULE_NAME>/foo/bar
   * @param path path to the directory on the machine you'd like to serve
   * @param canBrowse can users browse the contents of the directory (listings)
   */
  def addStaticResource(uriDirectory: String, path: Path, canBrowse: Boolean): ModuleFactoryNode ={
    ModuleFactoryNode(tableDefs, rpc, vsName, staticServedResources ++ List(StaticServedResource(uriDirectory, path, canBrowse)))
  }

  def asModule(): ViewServerModule = {

    val baseTables      = tableDefs.tableDefs
    val justBaseTables  = baseTables.map({case(tbl, provFunc) => tbl})

    var mutableTableDefs = TableDefs(justBaseTables, List(), List());

    //we do this loop to allow join tables to depend on other realized join tables
    tableDefs.joinDefs.foreach( toJTFunc => {

      val realizedJoinTableDef = toJTFunc(mutableTableDefs)
      
      mutableTableDefs = mutableTableDefs.addRealized(realizedJoinTableDef);
    })

    val theName = vsName

    new ViewServerModule {
      override def name: String =  theName
      override def tableDefs: List[TableDef] = mutableTableDefs.realizedTableDefs
      override def serializationMixin: AnyRef = null
      override def rpcHandlerUnrealized: VuuServer => RpcHandler = {
        rpc.head
      }

      override def getProviderForTable(table: DataTable, viewserver: VuuServer)(implicit time: Clock, lifecycleContainer: LifecycleContainer): Provider = {
        baseTables.find({case(td, func) => td.name == table.name }).get._2(table, viewserver)
      }
      override def staticFileResources(): List[StaticServedResource] = staticServedResources
    }

  }
}

object ModuleFactory {

  implicit def stringToString(s: String) = new FieldDefString(s)

  def withNamespace(ns: String): ModuleFactoryNode ={
    return ModuleFactoryNode(TableDefs(List(), List(), List()), List(), ns, List());
  }

}
