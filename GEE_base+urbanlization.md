```javascript
// =======================================================
// 中国五大城市群 湿地细分结构与城市化驱动力同步提取代码
// 包含：8类细分湿地面积 + MODIS建成区面积 + 统一夜灯指数 (2001-2022)
// =======================================================

// ========== 1. 配置区域 ==========

// 🔴 1. 选择城市群: 'PRD', 'YRD', 'HX', 'BBG', 'BYS', 'ALL'
var currentCluster = 'ALL';

// 🔴 2. 导出文件夹名称
var exportFolder = 'GEE_Wetland_Urban_Unified';

// 🔴 3. 时间范围 (2001-2022)
var startYear = 2001;
var endYear = 2022;

// ========== 2. 城市群定义 (v4 — 沿海城市双重过滤) ==========

var clusterConfigs = {
  'PRD': { name: '珠江三角洲', provinces: [], cities: [
    {name: 'Guangzhou', province: 'Guangdong Sheng'}, {name: 'Shenzhen', province: 'Guangdong Sheng'},
    {name: 'Dongguan', province: 'Guangdong Sheng'}, {name: 'Huizhou', province: 'Guangdong Sheng'},
    {name: 'Zhuhai', province: 'Guangdong Sheng'}, {name: 'Zhongshan', province: 'Guangdong Sheng'},
    {name: 'Jiangmen', province: 'Guangdong Sheng'}, {name: 'Shanwei', province: 'Guangdong Sheng'}
  ], regions: ['Hong Kong', 'Macao']},
  'YRD': { name: '长江三角洲', provinces: ['Shanghai Shi'], cities: [
    {name: 'Nantong', province: 'Jiangsu Sheng'}, {name: 'Yancheng', province: 'Jiangsu Sheng'},
    {name: 'Lianyungang', province: 'Jiangsu Sheng'}, {name: 'Hangzhou', province: 'Zhejiang Sheng'},
    {name: 'Ningbo', province: 'Zhejiang Sheng'}, {name: 'Wenzhou', province: 'Zhejiang Sheng'},
    {name: 'Taizhou', province: 'Zhejiang Sheng'}, {name: 'Zhoushan', province: 'Zhejiang Sheng'},
    {name: 'Jiaxing', province: 'Zhejiang Sheng'}, {name: 'Shaoxing', province: 'Zhejiang Sheng'}
  ], regions: []},
  'HX': { name: '海峡西岸', provinces: [], cities: [
    {name: 'Fuzhou', province: 'Fujian Sheng'}, {name: 'Xiamen', province: 'Fujian Sheng'},
    {name: 'Quanzhou', province: 'Fujian Sheng'}, {name: 'Zhangzhou', province: 'Fujian Sheng'},
    {name: 'Putian', province: 'Fujian Sheng'}, {name: 'Ningde', province: 'Fujian Sheng'},
    {name: 'Shantou', province: 'Guangdong Sheng'}, {name: 'Chaozhou', province: 'Guangdong Sheng'},
    {name: 'Jieyang', province: 'Guangdong Sheng'}
  ], regions: []},
  'BBG': { name: '北部湾', provinces: ['Hainan Sheng'], cities: [
    {name: 'Beihai', province: 'Guangxi Zhuangzu Zizhiqu'}, {name: 'Qinzhou', province: 'Guangxi Zhuangzu Zizhiqu'},
    {name: 'Fangchenggang', province: 'Guangxi Zhuangzu Zizhiqu'}, {name: 'Zhanjiang', province: 'Guangdong Sheng'},
    {name: 'Maoming', province: 'Guangdong Sheng'}, {name: 'Yangjiang', province: 'Guangdong Sheng'}
  ], regions: []},
  'BYS': { name: '环渤黄海', provinces: ['Tianjin Shi'], cities: [
    {name: 'Qinhuangdao', province: 'Hebei Sheng'}, {name: 'Tangshan', province: 'Hebei Sheng'},
    {name: 'Cangzhou', province: 'Hebei Sheng'}, {name: 'Dalian', province: 'Liaoning Sheng'},
    {name: 'Dandong', province: 'Liaoning Sheng'}, {name: 'Name Unknown', province: 'Liaoning Sheng'},
    {name: 'Panjin', province: 'Liaoning Sheng'}, {name: 'Jinzhou', province: 'Liaoning Sheng'},
    {name: 'Huludao', province: 'Liaoning Sheng'}, {name: 'Qingdao', province: 'Shandong Sheng'},
    {name: 'Yantai', province: 'Shandong Sheng'}, {name: 'Weihai', province: 'Shandong Sheng'},
    {name: 'Rizhao', province: 'Shandong Sheng'}, {name: 'Dongying', province: 'Shandong Sheng'},
    {name: 'Weifang', province: 'Shandong Sheng'}, {name: 'Binzhou', province: 'Shandong Sheng'}
  ], regions: []}
};

clusterConfigs['ALL'] = { name: '全部沿海城市群', provinces: [], cities: [], regions: [] };
['PRD', 'YRD', 'HX', 'BBG', 'BYS'].forEach(function(k){
  clusterConfigs['ALL'].cities = clusterConfigs['ALL'].cities.concat(clusterConfigs[k].cities);
  clusterConfigs['ALL'].provinces = clusterConfigs['ALL'].provinces.concat(clusterConfigs[k].provinces);
  clusterConfigs['ALL'].regions = clusterConfigs['ALL'].regions.concat(clusterConfigs[k].regions);
});

var config = clusterConfigs[currentCluster];

// --- 构建研究区几何 ---
var level1 = ee.FeatureCollection('FAO/GAUL/2015/level1');
var level2 = ee.FeatureCollection('FAO/GAUL/2015/level2');
var level0 = ee.FeatureCollection('FAO/GAUL/2015/level0');
var studyAreaCollection = ee.FeatureCollection([]);

if (config.cities.length > 0) {
  var cityFCs = config.cities.map(function(c) {
    return level2.filter(ee.Filter.and(ee.Filter.eq('ADM0_NAME', 'China'), ee.Filter.eq('ADM2_NAME', c.name), ee.Filter.eq('ADM1_NAME', c.province)))
    .map(function(f) { return f.set('NAME', f.get('ADM2_NAME')); });
  });
  for (var ci = 0; ci < cityFCs.length; ci++) { studyAreaCollection = studyAreaCollection.merge(cityFCs[ci]); }
}
if (config.provinces.length > 0) {
  studyAreaCollection = studyAreaCollection.merge(level1.filter(ee.Filter.and(ee.Filter.eq('ADM0_NAME', 'China'), ee.Filter.inList('ADM1_NAME', config.provinces))).map(function(f) { return f.set('NAME', f.get('ADM1_NAME')); }));
}
if (config.regions.length > 0) {
  studyAreaCollection = studyAreaCollection.merge(level0.filter(ee.Filter.inList('ADM0_NAME', config.regions)).map(function(f) { return f.set('NAME', f.get('ADM0_NAME')); }));
}

Map.centerObject(studyAreaCollection, 6);
Map.addLayer(studyAreaCollection.style({color:'red', fillColor:'00000000'}), {}, '边界');

// ========== 3. 统一夜灯指数函数 (NTL Harmonization - 修复波段名) ==========

var getUnifiedNTL = function(year) {
  if (year <= 2013) {
    // 2001-2013: DMSP-OLS
    return ee.ImageCollection("NOAA/DMSP-OLS/NIGHTTIME_LIGHTS")
      .filter(ee.Filter.calendarRange(year, year, 'year'))
      .select('stable_lights')
      .mosaic()
      .rename('ntl');
  } else {
    // 2014-2022: VIIRS
    var viirs;
    if (year < 2022) {
      // 🔴 修复：ANNUAL_V21 波段名为 'average'
      viirs = ee.ImageCollection("NOAA/VIIRS/DNB/ANNUAL_V21")
        .filter(ee.Filter.calendarRange(year, year, 'year'))
        .select('average')
        .mosaic();
    } else {
      // 🔴 2022年使用月度合成波段名为 'avg_rad'
      viirs = ee.ImageCollection("NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG")
        .filter(ee.Filter.calendarRange(2022, 2022, 'year'))
        .select('avg_rad').mean();
    }
    // 跨传感器校准公式
    return viirs.expression('63 * (1 - exp(-0.2 * b()))').rename('ntl');
  }
};

// ========== 4. 核心计算逻辑 ==========

var originalClasses =[180, 181, 182, 183, 184, 185, 186, 187];
var newClasses      =[1,   2,   3,   4,   5,   6,   7,   8];
var classNamesEN =['Permanent_Water', 'Swamp', 'Marsh', 'Flooded_Flat', 'Saline', 'Mangrove', 'Salt_Marsh', 'Tidal_Flat'];

var years = [];
for (var i = startYear; i <= endYear; i++) { years.push(i); }

var yearlyStatsList = years.map(function(year) {

  // --- A. 准备细分湿地数据 ---
  var wetImg = ee.Image("projects/sat-io/open-datasets/GWL_FCS30/GWL_FCS30_" + year).select('b1').clip(studyAreaCollection);
  var classImg = wetImg.remap(originalClasses, newClasses, 0).selfMask().rename('class');
  var combinedWetland = ee.Image.pixelArea().divide(1e6).addBands(classImg);

  // --- B. 准备 MODIS 建成区数据 ---
  var modisCol = ee.ImageCollection("MODIS/061/MCD12Q1").filter(ee.Filter.calendarRange(year, year, 'year'));
  var urbanAreaImg = ee.Image(ee.Algorithms.If(
    modisCol.size().gt(0),
    ee.Image.pixelArea().divide(1e6).updateMask(modisCol.first().select('LC_Type1').eq(13)).rename('urban'),
    ee.Image.constant(0).rename('urban')
  ));

  // --- C. 准备统一夜灯数据 ---
  var ntlImg = getUnifiedNTL(year).clip(studyAreaCollection);

  // --- D. 遍历城市统计 ---
  return studyAreaCollection.map(function(cityFeature) {
    var geom = cityFeature.geometry();
    var cityName = cityFeature.get('NAME');

    // 1. 湿地面积统计
    var wStats = combinedWetland.reduceRegion({
      reducer: ee.Reducer.sum().group({ groupField: 1, groupName: 'code' }),
      geometry: geom, scale: 100, maxPixels: 1e12
    });

    // 2. MODIS 建成区面积
    var mStats = urbanAreaImg.reduceRegion({
      reducer: ee.Reducer.sum(), geometry: geom, scale: 500, maxPixels: 1e12
    });

    // 3. 统一夜灯指数均值
    var hStats = ntlImg.reduceRegion({
      reducer: ee.Reducer.mean(), geometry: geom, scale: 500, maxPixels: 1e12
    });

    // 4. 重组字典
    var dict = ee.Dictionary({
      'Year': year,
      'City': cityName,
      'Cluster': config.name,
      'MODIS_Urban_Area_sqkm': ee.Algorithms.If(mStats.contains('urban'), mStats.get('urban'), 0),
      'Unified_NTL_Index': ee.Algorithms.If(hStats.contains('ntl'), hStats.get('ntl'), 0)
    });

    var groups = ee.List(ee.Algorithms.If(wStats.contains('groups'), wStats.get('groups'), ee.List([])));
    var classStats = groups.map(function(item) {
      item = ee.Dictionary(item);
      var name = ee.List(classNamesEN).get(ee.Number(item.get('code')).subtract(1));
      return ee.List([name, item.get('sum')]);
    }).flatten();

    return ee.Feature(null, dict.combine(ee.Dictionary.fromLists(
      classStats.slice(0, classStats.size(), 2),
      classStats.slice(1, classStats.size(), 2)
    )));
  });
});

var finalCollection = ee.FeatureCollection(yearlyStatsList).flatten();

// ========== 5. 可视化与导出 ==========

var palette =['0066FF', '00CC66', 'FFFF00', 'FF9900', 'FF0000', '9933FF', 'FF00FF', '00FFFF'];
Map.addLayer(ee.Image("projects/sat-io/open-datasets/GWL_FCS30/GWL_FCS30_" + endYear).remap(originalClasses, newClasses, 0).selfMask().clip(studyAreaCollection), {min:1, max:8, palette: palette}, '细分湿地 ' + endYear);

var selectors =[
  'Year', 'Cluster', 'City',
  'MODIS_Urban_Area_sqkm', 'Unified_NTL_Index',
  'Permanent_Water', 'Swamp', 'Marsh', 'Flooded_Flat', 'Saline', 'Mangrove', 'Salt_Marsh', 'Tidal_Flat'
];

Export.table.toDrive({
  collection: finalCollection,
  description: 'Wetland_Urban_Unified_NTL',
  folder: exportFolder,
  fileNamePrefix: 'Wetland_Urban_Unified_' + currentCluster,
  fileFormat: 'CSV',
  selectors: selectors
});

print('✅ 波段命名修复完毕，任务已就绪。');

```
