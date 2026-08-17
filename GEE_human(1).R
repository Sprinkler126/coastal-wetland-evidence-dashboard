// =======================================================
  // 中国五大城市群 湿地细分结构与城市化驱动力同步提取代码
// 包含：8类细分湿地面积 + MODIS建成区面积 + VIIRS夜间灯光
// =======================================================
  
  // ========== 1. 配置区域 ==========
  
  // 🔴 1. 选择城市群: 'PRD', 'YRD', 'JJJ', 'HX', 'BBG'
var currentCluster = 'HX'; 

// 🔴 2. 导出文件夹名称
var exportFolder = 'GEE_Wetland_Urban_Analysis';

// 🔴 3. 时间范围 (2001-2022, 匹配MODIS数据集起始时间)
var startYear = 2001;
var endYear = 2022;

// ========== 2. 城市群定义 ==========
  
  var clusterConfigs = {
    'PRD': {
      name: '珠江三角洲',
      cities:['Guangzhou', 'Shenzhen', 'Zhuhai', 'Foshan', 'Huizhou', 'Dongguan', 'Zhongshan', 'Jiangmen', 'Zhaoqing'],
      regions:['Hong Kong', 'Macao'], provinces:[]
    },
    'YRD': {
      name: '长江三角洲',
      cities:['Nanjing', 'Wuxi', 'Changzhou', 'Suzhou', 'Nantong', 'Yancheng', 'Yangzhou', 'Zhenjiang', 'Taizhou', 
              'Hangzhou', 'Ningbo', 'Wenzhou', 'Jiaxing', 'Huzhou', 'Shaoxing', 'Jinhua', 'Zhoushan', 'Taizhou', 
              'Hefei', 'Wuhu', 'Ma\'anshan', 'Tongling', 'Anqing', 'Chuzhou', 'Chizhou', 'Xuancheng'],
      provinces: ['Shanghai'], regions:[]
    },
    'JJJ': {
      name: '京津冀',
      cities:['Shijiazhuang', 'Tangshan', 'Qinhuangdao', 'Handan', 'Xingtai', 'Baoding', 'Zhangjiakou', 'Chengde', 'Cangzhou', 'Langfang', 'Hengshui'],
      provinces: ['Beijing', 'Tianjin'], regions:[]
    },
    'HX': {
      name: '海峡西岸',
      cities:['Fuzhou', 'Xiamen', 'Zhangzhou', 'Quanzhou', 'Putian', 'Sanming', 'Nanping', 'Longyan', 'Ningde', 
              'Shantou', 'Chaozhou', 'Jieyang', 'Wenzhou'],
      provinces: [], regions:[]
    },
    'BBG': {
      name: '北部湾',
      cities:['Nanning', 'Beihai', 'Qinzhou', 'Fangchenggang', 'Yulin', 'Chongzuo', 
              'Zhanjiang', 'Maoming', 'Yangjiang', 'Haikou', 'Danzhou', 'Sanya'],
      provinces: [], regions: []
    }
  };

var config = clusterConfigs[currentCluster];
print('当前分析城市群:', config.name);

// --- 构建研究区几何 ---
  var studyAreaCollection = ee.FeatureCollection([]);
if (config.cities.length > 0) {
  studyAreaCollection = studyAreaCollection.merge(
    ee.FeatureCollection('FAO/GAUL/2015/level2').filter(ee.Filter.inList('ADM2_NAME', config.cities)).map(function(f){return f.set('NAME', f.get('ADM2_NAME'))})
  );
}
if (config.provinces.length > 0) {
  studyAreaCollection = studyAreaCollection.merge(
    ee.FeatureCollection('FAO/GAUL/2015/level1').filter(ee.Filter.inList('ADM1_NAME', config.provinces)).map(function(f){return f.set('NAME', f.get('ADM1_NAME'))})
  );
}
if (config.regions.length > 0) {
  studyAreaCollection = studyAreaCollection.merge(
    ee.FeatureCollection('FAO/GAUL/2015/level0').filter(ee.Filter.inList('ADM0_NAME', config.regions)).map(function(f){return f.set('NAME', f.get('ADM0_NAME'))})
  );
}

Map.centerObject(studyAreaCollection, 6);
Map.addLayer(studyAreaCollection.style({color:'red', fillColor:'00000000'}), {}, '边界');

// ========== 3. 核心计算逻辑 ==========
  
  var originalClasses =[180, 181, 182, 183, 184, 185, 186, 187];
var newClasses      =[1,   2,   3,   4,   5,   6,   7,   8];
var classNamesEN =['Permanent_Water', 'Swamp', 'Marsh', 'Flooded_Flat', 'Saline', 'Mangrove', 'Salt_Marsh', 'Tidal_Flat'];

var years =[];
for (var i = startYear; i <= endYear; i++) {
  years.push(i);
}

// 客户端 map 循环构建任务
var yearlyStatsList = years.map(function(year) {
  
  // --- A. 准备细分湿地数据 ---
    var wetlandImgPath = "projects/sat-io/open-datasets/GWL_FCS30/GWL_FCS30_" + year;
    var wetlandImg = ee.Image(wetlandImgPath).select('b1').clip(studyAreaCollection);
    var classImg = wetlandImg.remap(originalClasses, newClasses, 0).selfMask().rename('class');
    var wetlandAreaImg = ee.Image.pixelArea().divide(1e6).rename('area_sqkm');
    var combinedWetland = wetlandAreaImg.addBands(classImg);
    
    // --- B. 准备 MODIS 建成区数据 (2001-2022) ---
      var modisCol = ee.ImageCollection("MODIS/061/MCD12Q1").filter(ee.Filter.calendarRange(year, year, 'year'));
      var urbanAreaImg = ee.Image(ee.Algorithms.If(
        modisCol.size().gt(0),
        ee.Image.pixelArea().divide(1e6).updateMask(modisCol.first().select('LC_Type1').eq(13)).rename('urban_area_sqkm'),
        ee.Image.constant(0).rename('urban_area_sqkm')
      ));
      
      // --- C. 准备 VIIRS 夜间灯光数据 (2014-2022高质量版) ---
        var viirsCol = ee.ImageCollection("NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG").filter(ee.Filter.calendarRange(year, year, 'year'));
        var viirsImg = ee.Image(ee.Algorithms.If(
          viirsCol.size().gt(0),
          viirsCol.select('avg_rad').mean().rename('avg_rad'),
          ee.Image.constant(-9999).rename('avg_rad') // 无数据年份填入-9999
        ));
        
        // --- D. 遍历城市群中的每个城市，提取上述三项数据 ---
          return studyAreaCollection.map(function(cityFeature) {
            var geom = cityFeature.geometry();
            var cityName = cityFeature.get('NAME');
            
            // 1. 提取 8 类湿地面积
            var wStats = combinedWetland.reduceRegion({
              reducer: ee.Reducer.sum().group({
                groupField: 1,
                groupName: 'class_code',
              }),
              geometry: geom,
              scale: 100, 
              maxPixels: 1e12
            });
            
            // 2. 提取 MODIS 建成区面积
            var mStats = urbanAreaImg.reduceRegion({
              reducer: ee.Reducer.sum(),
              geometry: geom,
              scale: 500,
              maxPixels: 1e12
            });
            var modisArea = ee.Algorithms.If(mStats.contains('urban_area_sqkm'), mStats.get('urban_area_sqkm'), 0);
            
            // 3. 提取 VIIRS 夜间灯光均值
            var nStats = viirsImg.reduceRegion({
              reducer: ee.Reducer.mean(),
              geometry: geom,
              scale: 500,
              maxPixels: 1e12
            });
            var ntlValue = ee.Algorithms.If(nStats.contains('avg_rad'), nStats.get('avg_rad'), -9999);
            
            // 4. 重组与清洗数据
            var dict = ee.Dictionary({
              'Year': year,
              'City': cityName,
              'Cluster': config.name,
              'MODIS_Urban_Area_sqkm': modisArea,
              'VIIRS_NTL_Mean': ntlValue
            });
            
            // 解析湿地分组统计
            var groups = ee.Algorithms.If(wStats.contains('groups'), ee.List(wStats.get('groups')), ee.List([]));
            var classStats = ee.List(groups).map(function(item) {
              item = ee.Dictionary(item);
              var code = ee.Number(item.get('class_code'));
              var area = ee.Number(item.get('sum'));
              var name = ee.List(classNamesEN).get(code.subtract(1)); 
              return ee.List([name, area]);
            }).flatten();
            
            // 合并字典返回
            return ee.Feature(null, dict.combine(ee.Dictionary.fromLists(
              classStats.slice(0, classStats.size(), 2), 
              classStats.slice(1, classStats.size(), 2)
            )));
          });
});

var finalCollection = ee.FeatureCollection(yearlyStatsList).flatten();

// ========== 4. 可视化 ==========
  
  var palette =['0066FF', '00CC66', 'FFFF00', 'FF9900', 'FF0000', '9933FF', 'FF00FF', '00FFFF'];
var imgEnd = ee.Image("projects/sat-io/open-datasets/GWL_FCS30/GWL_FCS30_" + endYear).remap(originalClasses, newClasses, 0).selfMask().clip(studyAreaCollection);

Map.addLayer(imgEnd, {min:1, max:8, palette: palette}, endYear + ' 细分湿地分布');

var legend = ui.Panel({style: {position: 'bottom-left', padding: '8px'}});
legend.add(ui.Label('湿地类型', {fontWeight: 'bold'}));
var cnNames =['永久水体', '沼泽', '泥沼', '洪泛平原', '盐碱地', '红树林', '盐沼', '潮滩'];
for(var i=0; i<8; i++){
  legend.add(ui.Panel({
    widgets: [
      ui.Label({style: {backgroundColor: '#' + palette[i], padding: '8px', margin: '0 5px 0 0'}}),
      ui.Label({value: cnNames[i], style: {fontSize: '12px'}})
    ],
    layout: ui.Panel.Layout.Flow('horizontal')
  }));
}
Map.add(legend);

// ========== 5. 导出设置 ==========
  
  // 将城市化驱动力变量放在城市名后面，紧接着是各类湿地的面积
var selectors =[
  'Year', 'Cluster', 'City', 
  'MODIS_Urban_Area_sqkm', 'VIIRS_NTL_Mean', 
  'Permanent_Water', 'Swamp', 'Marsh', 'Flooded_Flat', 'Saline', 'Mangrove', 'Salt_Marsh', 'Tidal_Flat'
];

Export.table.toDrive({
  collection: finalCollection,
  description: 'Export_' + currentCluster + '_Wetland_Urban',
  folder: exportFolder,
  fileNamePrefix: 'Wetland_Urban_' + currentCluster + '_2001-2022',
  fileFormat: 'CSV',
  selectors: selectors
});

print('✅ 湿地细分结构与城市化驱动力（MODIS 建成区 + VIIRS 夜间灯光）融合提取完毕！');
print('请在 Tasks 面板点击 RUN。');