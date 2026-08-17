// =======================================================
  // 中国五大城市群湿地时间序列分析 (2000-2022) + ERA5-Land 气候驱动力 
// =======================================================
  
  // ========== 1. 配置区域 ==========
  
  // 🔴 1. 选择城市群: 'PRD', 'YRD', 'JJJ', 'HX', 'BBG'
var currentCluster = 'BBG'; 

// 🔴 2. 导出文件夹名称
var exportFolder = 'GEE_Wetland_Climate_Analysis_2025';

// 🔴 3. 时间范围
var startYear = 2000;
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
      provinces: [], regions:[]
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

// ========== 3. 核心计算逻辑 (湿地 + ERA5气候数据) ==========
  
  var originalClasses =[180, 181, 182, 183, 184, 185, 186, 187];
var newClasses      =[1,   2,   3,   4,   5,   6,   7,   8];
var classNamesEN =['Permanent_Water', 'Swamp', 'Marsh', 'Flooded_Flat', 'Saline', 'Mangrove', 'Salt_Marsh', 'Tidal_Flat'];

var years =[];
for (var i = startYear; i <= endYear; i++) {
  years.push(i);
}

// 提取月度气候数据并聚合成年度
var yearlyStatsList = years.map(function(year) {
  
  // --- A. 准备湿地数据 ---
    var wetlandImgPath = "projects/sat-io/open-datasets/GWL_FCS30/GWL_FCS30_" + year;
    var wetlandImg = ee.Image(wetlandImgPath).select('b1').clip(studyAreaCollection);
    var classImg = wetlandImg.remap(originalClasses, newClasses, 0).selfMask().rename('class');
    var areaImg = ee.Image.pixelArea().divide(1e6).rename('area_sqkm');
    var combinedWetland = areaImg.addBands(classImg);
    
    // --- B. 准备 ERA5-Land 年度气候数据 ---
      var era5 = ee.ImageCollection("ECMWF/ERA5_LAND/MONTHLY_AGGR")
      .filter(ee.Filter.calendarRange(year, year, 'year'));
      
      // 1. 年平均温度 (Kelvin 转换为 Celsius，温度是状态量，不带_sum) [1][8]
      var temp = era5.select('temperature_2m').mean().subtract(273.15).rename('Temp_C');
      
      // 2. 年总降水量 (m 转换为 mm，累积量带 _sum) [5][10]
      var prec = era5.select('total_precipitation_sum').sum().multiply(1000).rename('Precip_mm');
      
      // 3. 年总蒸散发 (m 转换为 mm，累积量带 _sum。ERA5蒸发为负值，乘以-1000转为正数) [2]
      var evap = era5.select('total_evaporation_sum').sum().multiply(-1000).rename('Evap_mm');
      
      // 组合气候波段
      var climateImg = temp.addBands(prec).addBands(evap).clip(studyAreaCollection);
      
      // --- C. 映射计算每个城市的数据 ---
        return studyAreaCollection.map(function(cityFeature) {
          var geom = cityFeature.geometry();
          var cityName = cityFeature.get('NAME');
          
          // 1. 计算湿地面积 (100m分辨率)
          var wStats = combinedWetland.reduceRegion({
            reducer: ee.Reducer.sum().group({
              groupField: 1,
              groupName: 'class_code',
            }),
            geometry: geom,
            scale: 100,
            maxPixels: 1e12
          });
          
          // 2. 计算气候均值 (11132m 分辨率，即 ERA5 原生分辨率 0.1 度)
          var cStats = climateImg.reduceRegion({
            reducer: ee.Reducer.mean(),
            geometry: geom,
            scale: 11132,
            maxPixels: 1e9
          });
          
          // 3. 数据重组与清洗
          var dict = ee.Dictionary({
            'Year': year,
            'City': cityName,
            'Cluster': config.name,
            'Temp_Mean_C': cStats.get('Temp_C'),       
            'Precip_Sum_mm': cStats.get('Precip_mm'),  
            'Evap_Sum_mm': cStats.get('Evap_mm')       
          });
          
          // 解析湿地分类统计结果
          var groups = ee.Algorithms.If(wStats.contains('groups'), ee.List(wStats.get('groups')), ee.List([]));
          
          var classStats = ee.List(groups).map(function(item) {
            item = ee.Dictionary(item);
            var code = ee.Number(item.get('class_code'));
            var area = ee.Number(item.get('sum'));
            var name = ee.List(classNamesEN).get(code.subtract(1)); 
            return ee.List([name, area]);
          }).flatten();
          
          // 合并气候字典与湿地面积字典
          var finalDict = dict.combine(ee.Dictionary.fromLists(
            classStats.slice(0, classStats.size(), 2), 
            classStats.slice(1, classStats.size(), 2)
          ));
          
          return ee.Feature(null, finalDict);
        });
});

var finalCollection = ee.FeatureCollection(yearlyStatsList).flatten();

// ========== 4. 可视化 ==========
  
  var palette =['0066FF', '00CC66', 'FFFF00', 'FF9900', 'FF0000', '9933FF', 'FF00FF', '00FFFF'];
var imgEnd = ee.Image("projects/sat-io/open-datasets/GWL_FCS30/GWL_FCS30_" + endYear).remap(originalClasses, newClasses, 0).selfMask().clip(studyAreaCollection);

Map.addLayer(imgEnd, {min:1, max:8, palette: palette}, endYear + ' 湿地');

var legend = ui.Panel({style: {position: 'bottom-left', padding: '8px'}});
legend.add(ui.Label('湿地类型', {fontWeight: 'bold'}));
var cnNames =['永久水体', '沼泽', '泥沼', '洪泛平原', '盐碱地', '红树林', '盐沼', '潮滩'];
for(var i=0; i<8; i++){
  legend.add(ui.Panel({
    widgets:[
      ui.Label({style: {backgroundColor: '#' + palette[i], padding: '8px', margin: '0 5px 0 0'}}),
      ui.Label({value: cnNames[i], style: {fontSize: '12px'}})
    ],
    layout: ui.Panel.Layout.Flow('horizontal')
  }));
}
Map.add(legend);

// ========== 5. 导出设置 ==========
  
  var selectors =[
    'Year', 'Cluster', 'City', 
    'Temp_Mean_C', 'Precip_Sum_mm', 'Evap_Sum_mm', 
    'Permanent_Water', 'Swamp', 'Marsh', 'Flooded_Flat', 'Saline', 'Mangrove', 'Salt_Marsh', 'Tidal_Flat'
  ];

Export.table.toDrive({
  collection: finalCollection,
  description: 'Export_' + currentCluster + '_with_Climate',
  folder: exportFolder,
  fileNamePrefix: 'Wetland_Climate_' + currentCluster + '_2000-2022',
  fileFormat: 'CSV',
  selectors: selectors
});

print('✅ 波段修复完毕，气候与湿地数据融合成功！');
print('请在 Tasks 面板点击 RUN。');