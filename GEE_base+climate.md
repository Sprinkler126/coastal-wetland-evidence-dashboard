```javascript
// =======================================================
// 中国五大城市群湿地时间序列分析 (2001-2022) + ERA5-Land 气候极值增强版
// =======================================================

// ========== 1. 配置区域 ==========

// 🔴 1. 选择城市群: 'PRD', 'YRD', 'HX', 'BBG', 'BYS', 'ALL'
var currentCluster = 'ALL';

// 🔴 2. 导出文件夹名称
var exportFolder = 'GEE_Wetland_Climate_Analysis_2025';

// 🔴 3. 时间范围
var startYear = 2001;
var endYear = 2022;

// ========== 2. 城市群定义 (保持 v4 沿海版本) ==========

var clusterConfigs = {
  'PRD': { name: '珠江三角洲', provinces: [], cities: [
      {name: 'Guangzhou',  province: 'Guangdong Sheng'}, {name: 'Shenzhen',   province: 'Guangdong Sheng'},
      {name: 'Dongguan',   province: 'Guangdong Sheng'}, {name: 'Huizhou',    province: 'Guangdong Sheng'},
      {name: 'Zhuhai',     province: 'Guangdong Sheng'}, {name: 'Zhongshan',  province: 'Guangdong Sheng'},
      {name: 'Jiangmen',   province: 'Guangdong Sheng'}, {name: 'Shanwei',    province: 'Guangdong Sheng'}
    ], regions: ['Hong Kong', 'Macao']
  },
  'YRD': { name: '长江三角洲', provinces: ['Shanghai Shi'], cities: [
      {name: 'Nantong',      province: 'Jiangsu Sheng'}, {name: 'Yancheng',     province: 'Jiangsu Sheng'},
      {name: 'Lianyungang',  province: 'Jiangsu Sheng'}, {name: 'Hangzhou',     province: 'Zhejiang Sheng'},
      {name: 'Ningbo',       province: 'Zhejiang Sheng'}, {name: 'Wenzhou',      province: 'Zhejiang Sheng'},
      {name: 'Taizhou',      province: 'Zhejiang Sheng'}, {name: 'Zhoushan',     province: 'Zhejiang Sheng'},
      {name: 'Jiaxing',      province: 'Zhejiang Sheng'}, {name: 'Shaoxing',     province: 'Zhejiang Sheng'}
    ], regions: []
  },
  'HX': { name: '海峡西岸', provinces: [], cities: [
      {name: 'Fuzhou',    province: 'Fujian Sheng'}, {name: 'Xiamen',    province: 'Fujian Sheng'},
      {name: 'Quanzhou',  province: 'Fujian Sheng'}, {name: 'Zhangzhou', province: 'Fujian Sheng'},
      {name: 'Putian',    province: 'Fujian Sheng'}, {name: 'Ningde',    province: 'Fujian Sheng'},
      {name: 'Shantou',   province: 'Guangdong Sheng'}, {name: 'Chaozhou',  province: 'Guangdong Sheng'},
      {name: 'Jieyang',   province: 'Guangdong Sheng'}
    ], regions: []
  },
  'BBG': { name: '北部湾', provinces: ['Hainan Sheng'], cities: [
      {name: 'Beihai',        province: 'Guangxi Zhuangzu Zizhiqu'}, {name: 'Qinzhou',       province: 'Guangxi Zhuangzu Zizhiqu'},
      {name: 'Fangchenggang', province: 'Guangxi Zhuangzu Zizhiqu'}, {name: 'Zhanjiang',     province: 'Guangdong Sheng'},
      {name: 'Maoming',       province: 'Guangdong Sheng'}, {name: 'Yangjiang',     province: 'Guangdong Sheng'}
    ], regions: []
  },
  'BYS': { name: '环渤黄海', provinces: ['Tianjin Shi'], cities: [
      {name: 'Qinhuangdao',   province: 'Hebei Sheng'}, {name: 'Tangshan',       province: 'Hebei Sheng'},
      {name: 'Cangzhou',       province: 'Hebei Sheng'}, {name: 'Dalian',         province: 'Liaoning Sheng'},
      {name: 'Dandong',        province: 'Liaoning Sheng'}, {name: 'Name Unknown',   province: 'Liaoning Sheng'},
      {name: 'Panjin',         province: 'Liaoning Sheng'}, {name: 'Jinzhou',        province: 'Liaoning Sheng'},
      {name: 'Huludao',        province: 'Liaoning Sheng'}, {name: 'Qingdao',       province: 'Shandong Sheng'},
      {name: 'Yantai',        province: 'Shandong Sheng'}, {name: 'Weihai',        province: 'Shandong Sheng'},
      {name: 'Rizhao',        province: 'Shandong Sheng'}, {name: 'Dongying',      province: 'Shandong Sheng'},
      {name: 'Weifang',       province: 'Shandong Sheng'}, {name: 'Binzhou',       province: 'Shandong Sheng'}
    ], regions: []
  }
};

// 合并配置逻辑
clusterConfigs['ALL'] = { name: '全部沿海城市群', provinces: [], cities: [], regions: [] };
var allKeys = ['PRD', 'YRD', 'HX', 'BBG', 'BYS'];
allKeys.forEach(function(key) {
  var c = clusterConfigs[key];
  clusterConfigs['ALL'].cities = clusterConfigs['ALL'].cities.concat(c.cities);
  clusterConfigs['ALL'].provinces = clusterConfigs['ALL'].provinces.concat(c.provinces);
  clusterConfigs['ALL'].regions = clusterConfigs['ALL'].regions.concat(c.regions);
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

// ========== 3. 核心计算逻辑 (湿地 + 增强气候极值) ==========

var originalClasses =[180, 181, 182, 183, 184, 185, 186, 187];
var newClasses      =[1,   2,   3,   4,   5,   6,   7,   8];
var classNamesEN =['Permanent_Water', 'Swamp', 'Marsh', 'Flooded_Flat', 'Saline', 'Mangrove', 'Salt_Marsh', 'Tidal_Flat'];

var years = [];
for (var i = startYear; i <= endYear; i++) { years.push(i); }

var yearlyStatsList = years.map(function(year) {

  // --- A. 湿地面积图像 ---
  var wetImg = ee.Image("projects/sat-io/open-datasets/GWL_FCS30/GWL_FCS30_" + year).select('b1').clip(studyAreaCollection);
  var classImg = wetImg.remap(originalClasses, newClasses, 0).selfMask().rename('class');
  var combinedWetland = ee.Image.pixelArea().divide(1e6).addBands(classImg);

  // --- B. ERA5-Land 增强处理 (提取月度极值) ---
  var era5Col = ee.ImageCollection("ECMWF/ERA5_LAND/MONTHLY_AGGR")
                  .filter(ee.Filter.calendarRange(year, year, 'year'));

  // 1. 常规均态指标
  var tempMean = era5Col.select('temperature_2m').mean().subtract(273.15).rename('Temp_Mean_C');
  var precSum  = era5Col.select('total_precipitation_sum').sum().multiply(1000).rename('Precip_Sum_mm');
  var evapSum  = era5Col.select('total_evaporation_sum').sum().multiply(-1000).rename('Evap_Sum_mm');

  // 2. 极端气候代理指标 (🔴 新增)
  // 月最大降水量：寻找一年中降水最丰沛的月份
  var precMax  = era5Col.select('total_precipitation_sum').max().multiply(1000).rename('Max_Monthly_Precip_mm');
  // 最热月均温：一年中气温最高的月份
  var tempMax  = era5Col.select('temperature_2m').max().subtract(273.15).rename('Hottest_Month_Temp_C');
  // 最冷月均温：一年中气温最低的月份
  var tempMin  = era5Col.select('temperature_2m').min().subtract(273.15).rename('Coldest_Month_Temp_C');

  var climateImg = tempMean.addBands([precSum, evapSum, precMax, tempMax, tempMin]).clip(studyAreaCollection);

  // --- C. 空间统计提取 ---
  return studyAreaCollection.map(function(cityFeature) {
    var geom = cityFeature.geometry();
    var cityName = cityFeature.get('NAME');

    // 湿地统计 (100m)
    var wStats = combinedWetland.reduceRegion({
      reducer: ee.Reducer.sum().group({ groupField: 1, groupName: 'class_code' }),
      geometry: geom, scale: 100, maxPixels: 1e12
    });

    // 气候统计 (11132m)
    var cStats = climateImg.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: geom, scale: 11132, maxPixels: 1e9
    });

    // 组装结果
    var dict = ee.Dictionary({
      'Year': year, 'City': cityName, 'Cluster': config.name,
      'Temp_Mean_C': cStats.get('Temp_Mean_C'),
      'Precip_Sum_mm': cStats.get('Precip_Sum_mm'),
      'Evap_Sum_mm': cStats.get('Evap_Sum_mm'),
      'Max_Monthly_Precip_mm': cStats.get('Max_Monthly_Precip_mm'),
      'Hottest_Month_Temp_C': cStats.get('Hottest_Month_Temp_C'),
      'Coldest_Month_Temp_C': cStats.get('Coldest_Month_Temp_C')
    });

    var groups = ee.Algorithms.If(wStats.contains('groups'), ee.List(wStats.get('groups')), ee.List([]));
    var classStats = ee.List(groups).map(function(item) {
      item = ee.Dictionary(item);
      var name = ee.List(classNamesEN).get(ee.Number(item.get('class_code')).subtract(1));
      return ee.List([name, item.get('sum')]);
    }).flatten();

    return ee.Feature(null, dict.combine(ee.Dictionary.fromLists(
      classStats.slice(0, classStats.size(), 2),
      classStats.slice(1, classStats.size(), 2)
    )));
  });
});

var finalCollection = ee.FeatureCollection(yearlyStatsList).flatten();

// ========== 4. 导出设置 (包含极值字段) ==========

var selectors =[
  'Year', 'Cluster', 'City',
  'Temp_Mean_C', 'Precip_Sum_mm', 'Evap_Sum_mm',
  'Max_Monthly_Precip_mm', 'Hottest_Month_Temp_C', 'Coldest_Month_Temp_C',
  'Permanent_Water', 'Swamp', 'Marsh', 'Flooded_Flat', 'Saline', 'Mangrove', 'Salt_Marsh', 'Tidal_Flat'
];

Export.table.toDrive({
  collection: finalCollection,
  description: 'Wetland_Climate_Extremes_Export',
  folder: exportFolder,
  fileNamePrefix: 'Wetland_Climate_ALL_with_Extremes_2000-2022',
  fileFormat: 'CSV',
  selectors: selectors
});

print('✅ 增强版代码已就绪！');
print('  - 已包含均态气候：Temp_Mean, Precip_Sum, Evap_Sum');
print('  - 已包含极端气候：Max_Monthly_Precip, Hottest_Temp, Coldest_Temp');

```
